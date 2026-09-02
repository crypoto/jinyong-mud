// 临时平衡标定模拟器：从 index.html 提取 A1 数据，复刻 A6 战斗逻辑
// 输出各典型对局（小怪/Boss/论剑）的胜率与胜局平均耗时，用于调整 BAL
"use strict";
const fs = require("fs");
const HTML = "d:/APP/workbuddy/workspace/claude-code-workspace-master/claude-code-workspace-master/02_游戏开发/金庸MUD/index.html";
const html = fs.readFileSync(HTML, "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const a1 = script.slice(0, script.indexOf("//#A1_END"));
const D = new Function(a1 + "\n;return {SK,EN,BAL,COLOR_X,TIER_COEF,LVL_POW,SK_EXP,RARITY,MECH_NM,TYPE_NAME};")();
const SK = D.SK, EN = D.EN, COLOR_X = D.COLOR_X, TIER_COEF = D.TIER_COEF;
const LVL_POW = D.LVL_POW, SK_EXP = D.SK_EXP, MECH_NM = D.MECH_NM;
let BAL = JSON.parse(JSON.stringify(D.BAL));

// 允许临时实验参数（标定完成后写回 index.html）
const TUNE = { hpMul: null, bossHpMul: null, pAtk: null, pPunch: null, eAtk: null, minE: null };
function applyTune(){
  if(TUNE.hpMul) BAL.hpMul = TUNE.hpMul;
  if(TUNE.bossHpMul){ if(!BAL.bossHpMul) BAL.bossHpMul = {}; Object.keys(TUNE.bossHpMul).forEach(k=>BAL.bossHpMul[k]=TUNE.bossHpMul[k]); }
  if(TUNE.pAtk!=null) BAL.pAtk = TUNE.pAtk;
  if(TUNE.pPunch!=null) BAL.pPunch = TUNE.pPunch;
  if(TUNE.eAtk!=null) BAL.eAtk = TUNE.eAtk;
  if(TUNE.minE!=null) BAL.minE = TUNE.minE;
}

const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const rnd = (a,b)=>Math.floor(Math.random()*(b-a+1))+a;

function gearBase(slot,lvl){ const b={weapon:{atk:4+lvl*3},armor:{def:2+lvl*2},trinket:{mp:18+lvl*12},belt:{hp:30+lvl*16},boots:{spd:1+lvl}}[slot]; return Object.assign({},b); }
function mkGear(slot,lvl,color){ const base=gearBase(slot,lvl),x=COLOR_X[color],g={slot,lvl,color,name:""}; for(const k in base) g[k]=Math.round(base[k]*x); return g; }
function lvMul(e,per){ return e? 1+(e.lv-1)*(per||0.06):1; }
function passive(P,code){ let v=0; const list=[]; (P.eq.outer||[]).forEach(id=>list.push(id)); if(P.eq.inner)list.push(P.eq.inner); if(P.eq.light)list.push(P.eq.light);
  list.forEach(id=>{ const sk=SK[id],e=P.learned[id]; if(!e) return; const m=lvMul(e,0.08);
    sk.tags.forEach(t=>{ if(t.k===code&&(code!=="rf"||sk.type===0)) v+=(t.a[0]||0)*m; if(t.k==="rf"&&code==="rf") v+=(t.a[0]||0)*m; }); }); return v; }
function getStats(P){ const A=P.attrs,g=P.gear;
  const wAtk=g.weapon?g.weapon.atk:2, aDef=g.armor?g.armor.def:0, hpAdd=g.belt?g.belt.hp:0, mpAdd=g.trinket?g.trinket.mp:0, spd=g.boots?g.boots.spd:0;
  const pa=passive(P,"pa"),pd=passive(P,"pd"),ph=passive(P,"ph"),ps=passive(P,"ps");
  const atk=Math.round((A.str*2+wAtk)*(1+pa));
  const def=Math.round((A.con+aDef)*(1+pd));
  const maxHp=Math.round((120+A.con*14)*(1+ph)+hpAdd);
  const maxMp=Math.round((50+A.int*10)*1+mpAdd);
  const spdEff=A.agi+Math.round(spd*0.4);
  return {atk,def,maxHp,maxMp,spdEff}; }
function equippedIds(P){ const l=[]; (P.eq.outer||[]).forEach(id=>l.push(id)); if(P.eq.inner)l.push(P.eq.inner); if(P.eq.light)l.push(P.eq.light); return l; }
function skillCd(sk){ const cds=[[2400,3200,4200,5400],[9500,11000,12500,14500],[8000,9500,11000,13000]]; return cds[sk.type]? (cds[sk.type][sk.rarity]||3600):3600; }
const OFF=["m","crit","ig","db","st","dot","ex","cb","ls","dm","df"];
function hasOff(sk){ return sk.tags.some(t=>OFF.includes(t.k)); }
function playerGap(st){ return clamp(1500-st.spdEff*20,950,1500); }
function enemyGap(foe){ return clamp(2350-foe.atk*1.6,1300,2450); }

// 单局战斗（返回 {win, t}，t 毫秒）。noScale=true 表示 HP 取 foeSeed.hp 定值（论剑）
function runOnce(P, foeSeed, noScale){
  const st=getStats(P);
  let foe;
  if(noScale){ foe=Object.assign({}, foeSeed, {hp:foeSeed.hp, maxHp:foeSeed.hp}); }
  else{ const hpMul= foeSeed.boss? (BAL.bossHpMul? BAL.bossHpMul[foeSeed.d]:null)||(BAL.hpMul[foeSeed.d]||2)
                                        : (BAL.hpMul[foeSeed.d]||2);
        const hp=Math.round(foeSeed.hp*hpMul);
        foe=Object.assign({}, foeSeed, {hp, maxHp:hp}); }
  const c={foe, shield:0, iv:0, defend:false, foeDb:0, foeDot:null, foeSkip:0, pDot:null,
           stance: foe.mech==="stance"?"iron":null, enemyN:0, cd:{}};
  let myHP=st.maxHp, myMP=st.maxMp, t=0, nextP=500, nextF=1800;
  const FMAX=120000;
  const dbLive=()=>{ if(!c.foeDb) return false; if(t>c.foeDb.exp){ c.foeDb=0; return false; } return true; };
  const reflectTotal=()=>{ let r=0; equippedIds(P).forEach(id=>{ const sk=SK[id],e=P.learned[id]; sk.tags.forEach(tt=>{ if(tt.k==="rf") r+=(tt.a[0]||0)*lvMul(e,0.05); }); }); return Math.min(0.85,r); };

  function strike(sid){ // 返回值不关键，直接操作 foe.hp
    const sk=SK[sid], e=P.learned[sid];
    const critT=sk.tags.find(x=>x.k==="crit");
    const segN=(sk.tags.find(x=>x.k==="m")||{a:[1]}).a[0];
    const ig=sk.tags.some(x=>x.k==="ig");
    const baseHit=0.9+Math.min(0.2,(st.spdEff-10)*0.004);
    const lvp=LVL_POW[e.lv-1], coef=TIER_COEF[sk.rarity], eM=lvMul(e,0.05);
    const defAfter=foe.def*(dbLive()? (1-c.foeDb.pct):1);
    const exec=sk.tags.find(x=>x.k==="ex");
    const exMul= exec&&foe.hp/foe.maxHp<exec.a[0]? 1+exec.a[1]*eM : 1;
    let total=0, critN=0, hitN=0;
    const mode=foe.mech==="stance"? (c.stance||"iron") : foe.mech;
    let raw=st.atk*coef*lvp*exMul;
    if((mode==="iron"||mode==="iron2")&&!dbLive()) raw*= mode==="iron2"?0.35:0.5;
    const segTot=Math.max(0,Math.round(raw*BAL.pAtk-defAfter));
    for(let i=0;i<segN;i++){
      let seg=segTot;
      if(segN>1) seg=Math.floor(segTot/segN)+(i<segTot%segN?1:0);
      if(!ig&&Math.random()>baseHit) continue;
      let dmg=Math.max(1,seg);
      if(critT&&Math.random()<Math.min(0.85,critT.a[0]*eM)){ dmg=Math.round(dmg*critT.a[1]); critN++; }
      if(dmg<=0) continue;
      hitN++; foe.hp-=dmg; total+=dmg;
      const ls=sk.tags.find(x=>x.k==="ls");
      if(ls){ const h=Math.round(dmg*Math.min(0.5,ls.a[0]*eM)); myHP=Math.min(st.maxHp,myHP+h); }
      const dm=sk.tags.find(x=>x.k==="dm");
      if(dm){ const r=Math.round(dmg*Math.min(0.5,dm.a[0]*eM)); myMP=Math.min(st.maxMp,myMP+r); }
    }
    if(foe.hp<=0) return total;
    sk.tags.forEach(tt=>{
      if(tt.k==="db"&&hitN>0){ c.foeDb={pct:Math.min(0.75,tt.a[0]*eM),exp:t+tt.a[1]*1600}; }
      if(tt.k==="st"&&hitN>0&&Math.random()<Math.min(0.8,tt.a[0]*eM)){ c.foeSkip=Math.max(c.foeSkip,1); }
      if(tt.k==="dot"&&hitN>0){ c.foeDot={dmg:Math.max(1,Math.round(tt.a[0]*lvMul(e,0.06))),turns:tt.a[1]}; }
    });
    const cb=sk.tags.find(x=>x.k==="cb");
    if(cb&&Math.random()<Math.min(0.8,cb.a[0]*eM)&&foe.hp>0){
      const p2=Math.max(1,Math.round(st.atk*1.0*LVL_POW[e.lv-1]*BAL.pAtk-foe.def*0.85));
      foe.hp-=p2; total+=p2;
    }
    return total;
  }

  function regen(){ if(myMP<st.maxMp){ let g=0; if(P.eq.inner){ const sk=SK[P.eq.inner],e=P.learned[P.eq.inner]; sk.tags.forEach(tt=>{ if(tt.k==="pr") g+=(tt.a[0]||0)*lvMul(e,0.08); }); } if(g>0) myMP=Math.min(st.maxMp,myMP+g); } }

  function autoPick(){ const ids=equippedIds(P);
    for(const id of ids){ const sk=SK[id],e=P.learned[id]; if(!e||(c.cd[id]||0)>t||myMP<sk.mp) continue; if(hasOff(sk)) return id; }
    for(const id of ids){ const sk=SK[id],e=P.learned[id]; if(!e||(c.cd[id]||0)>t||myMP<sk.mp) continue;
      const sh=sk.tags.some(x=>x.k==="sh"), iv=sk.tags.some(x=>x.k==="iv");
      if(sh&&c.shield>0) continue; if(iv&&c.iv>0) continue;
      if(!sh&&!iv&&myMP>st.maxMp*0.6) continue;
      return id; }
    return null; }

  function playerAction(){
    regen();
    const sid=autoPick();
    if(sid){
      const sk=SK[sid], e=P.learned[sid];
      myMP-=sk.mp; c.cd[sid]=t+skillCd(sk);
      const isDual=sk.tags.some(x=>x.k==="df");
      if(!hasOff(sk)){
        let used=false;
        sk.tags.forEach(tt=>{
          if(tt.k==="sh"){ const v=Math.round(tt.a[0]*(1+e.lv*0.15)); c.shield+=v; used=true; }
          if(tt.k==="iv"){ c.iv=Math.max(c.iv,tt.a[0]); used=true; }
        });
        if(!used){ const rec=Math.round(st.maxMp*0.12)+3; myMP=Math.min(st.maxMp,myMP+rec); }
        nextP=t+(sk.type===0?300:400);
        return;
      }
      let total=0;
      if(isDual){
        const other=(P.eq.outer||[]).find(x=>x!==sid&&!SK[x].tags.some(y=>y.k==="df"));
        if(other&&myMP>=SK[other].mp){ myMP-=SK[other].mp; total+=strike(other); }
      }
      total+=strike(sid);
      nextP=t+(sk.type===0?300:400);
    }else{
      const dmg=Math.max(1,Math.round(st.atk*BAL.pPunch-foe.def*0.85)+rnd(0,5));
      foe.hp-=dmg;
      nextP=t+playerGap(st);
    }
  }

  function foeHit(opts){
    const o=opts||{};
    let dmg=foe.atk*BAL.eAtk+rnd(0,5)-Math.round(st.def*(c.defend?2:1));
    dmg=Math.max(1,dmg);
    dmg=Math.max(Math.round(foe.atk*BAL.minE),dmg);
    if(Math.random()<(o.crit||0.12)) dmg=Math.round(dmg*(o.dCrit||1.6));
    const rfPct=reflectTotal();
    if(c.iv>0){ c.iv--; return; }
    let absorbed=0;
    if(c.shield>0){ absorbed=Math.min(c.shield,dmg); c.shield-=absorbed; dmg-=absorbed;
      if(dmg>0) myHP-=dmg; else if(rfPct>0){ const rb=Math.round(absorbed*rfPct); foe.hp-=rb; } return; }
    myHP-=dmg;
    if(rfPct>0){ const rb=Math.round(dmg*rfPct); foe.hp-=rb; }
  }

  function foeTurn(){
    c.enemyN++;
    if(foe.mech==="stance"){
      const want=foe.hp/foe.maxHp>0.66?"iron":foe.hp/foe.maxHp>0.33?"swift":"poison";
      if(c.stance!==want) c.stance=want;
    }
    if(c.pDot){ let d=c.pDot.dmg,abs=0; if(c.shield>0){ abs=Math.min(c.shield,d); c.shield-=abs; d-=abs; }
      if(d>0) myHP-=d;
      c.pDot.turns--; if(c.pDot.turns<=0) c.pDot=null;
      if(myHP<=0) return false; }
    if(c.foeSkip>0){ c.foeSkip--; nextF=t+enemyGap(foe); return true; }
    if(c.foeDot){ foe.hp-=c.foeDot.dmg; c.foeDot.turns--; if(c.foeDot.turns<=0)c.foeDot=null;
      if(foe.hp<=0) return false; }
    if(foe.mech==="poison"&&!c.pDot&&c.enemyN%3===1){
      c.pDot={dmg:Math.max(4,Math.round(foe.atk*0.9)),turns:2};
    }
    const swift=foe.mech==="swift"||(foe.mech==="stance"&&c.stance==="swift");
    foeHit(swift?{crit:0.34,dCrit:1.9}:{crit:0.12,dCrit:1.6});
    if(swift&&foe.hp>0&&myHP>0&&Math.random()<0.45) foeHit({crit:0.22,dCrit:1.6});
    c.defend=false;
    if(myHP<=0) return false;
    if(foe.hp<=0) return false;
    nextF=t+enemyGap(foe);
    return true;
  }

  for(;;){
    if(myHP<=0) return {win:false,t,reason:"death"};
    if(foe.hp<=0) return {win:true,t};
    if(t>FMAX) return {win:false,t,reason:"time"};
    if(nextF<=nextP){ t=nextF; if(!foeTurn()) continue; }
    else { t=Math.max(nextP,t); playerAction(); }
  }
}

function mc(P, foe, noScale, n){
  let win=0, wsum=0, death=0, dsum=0, time=0;
  for(let i=0;i<n;i++){ const r=runOnce(P,foe,noScale);
    if(r.win){ win++; wsum+=r.t; }
    else if(r.reason==="death"){ death++; dsum+=r.t; }
    else time++; }
  return {winRate:win/n, avg: win? Math.round(wsum/win/1000*10)/10 : null,
          deathRate:death/n, avgDeath: death? Math.round(dsum/death/1000*10)/10 : null,
          timeRate:time/n};
}

// ---------- 战役表 ----------
const ATTR = {str:16,agi:14,int:12,con:16,luck:12};
function learn(P,id,lv){ P.learned[id]={lv,exp:0,spent:0}; }
function build(name, opts){
  const P={attrs:Object.assign({},ATTR,opts&&opts.attrs), eq:opts?{outer:[],inner:null,light:null}:{outer:[],inner:null,light:null}, learned:{}};
  if(!opts) return P;
  if(opts.eq){ P.eq={outer:(opts.eq.outer||[]).slice(),inner:opts.eq.inner||null,light:opts.eq.light||null}; }
  const gear={};
  for(const sl in (opts.gear||{})){ const o=opts.gear[sl]; gear[sl]=mkGear(sl,o.lvl,o.color); }
  P.gear=gear;
  for(const id in (opts.skills||{})) learn(P,id,opts.skills[id]);
  return P;
}
const A=(name,o)=>build(name,o);

const foes={
  shanzei:EN.shanzei, b1:EN.b1, menggu:EN.menggu, b2:EN.b2, xingxiu:EN.xingxiu, b3:EN.b3,
  b4:EN.b4, oyfeng:EN.oyfeng, jinlun:EN.jinlun, dongfang:EN.dongfang, b5:EN.b5,
  songdi:EN.songdi, heimu:EN.heimu, wangchong:EN.wangchong
};
const WAT={atk:52,def:22,exp:0,gold:0,stone:"rare",desc:""};

// 各档位玩家快照（贴近主线推进推荐状态）
const P1 = A("新手",{skills:{taizu:1,tuna:1,caofei:1},eq:{outer:["taizu"],inner:"tuna",light:"caofei"}});
const P2 = A("山贼毕业",{attrs:{str:18,agi:14,int:12,con:15,luck:11},skills:{taizu:4,tuna:3,caofei:3},eq:{outer:["taizu"],inner:"tuna",light:"caofei"},gear:{weapon:{lvl:2,color:0}}});
const P3 = A("少林Lv4",{skills:{luohan:4,weituo:4,dajin:2,jingang:3,yifu:2},eq:{outer:["luohan","weituo","dajin"],inner:"jingang",light:"yifu"},gear:{weapon:{lvl:3,color:1},armor:{lvl:3,color:0},belt:{lvl:3,color:0},boots:{lvl:3,color:0},trinket:{lvl:3,color:0}}});
const P4 = A("华山Lv6",{skills:{hsjian:6,sanjian:6,dugu:5,zixia:6,huayue:5},eq:{outer:["hsjian","sanjian","dugu"],inner:"zixia",light:"huayue"},gear:{weapon:{lvl:5,color:2},armor:{lvl:5,color:1},belt:{lvl:5,color:1},boots:{lvl:5,color:1},trinket:{lvl:5,color:1}}});
const P5 = A("华山Lv7-6",{skills:{hsjian:7,sanjian:7,dugu:6,zixia:7,huayue:6},eq:{outer:["sanjian","dugu"],inner:"zixia",light:"huayue"},gear:{weapon:{lvl:6,color:2},armor:{lvl:6,color:1},belt:{lvl:6,color:1},boots:{lvl:6,color:1},trinket:{lvl:6,color:1}}});
const P6 = A("武当Lv8",{skills:{taijiquan:8,taijijian:7,chunyang:8,tiyun:7,wdmian:7,rouyun:7},eq:{outer:["taijiquan","taijijian","rouyun"],inner:"chunyang",light:"tiyun"},gear:{weapon:{lvl:7,color:3},armor:{lvl:7,color:2},belt:{lvl:7,color:2},boots:{lvl:7,color:2},trinket:{lvl:7,color:2}}});
const P7 = A("论剑初",{skills:{xianglong:9,dugu:9,anran:8,jiuyang:9,lingbo:9},eq:{outer:["xianglong","dugu"],inner:"jiuyang",light:"lingbo"},gear:{weapon:{lvl:7,color:4},armor:{lvl:7,color:3},belt:{lvl:7,color:3},boots:{lvl:7,color:3},trinket:{lvl:7,color:3}}});
const P8 = A("论剑天下",{skills:{xianglong:9,dugu:9,anran:9,luoying:9,jiuyang:9,yijinjing:9,lingbo:9,zixia:8,emjiuyang:8},eq:{outer:["xianglong","dugu","anran"],inner:"yijinjing",light:"lingbo"},gear:{weapon:{lvl:7,color:4},armor:{lvl:7,color:3},belt:{lvl:7,color:3},boots:{lvl:7,color:3},trinket:{lvl:7,color:3}}});

function arena(customHP, atk, def, mech, name){
  return Object.assign({},WAT,{name,mech,hp:customHP,atk:Math.round(atk),def:Math.round(def)});
}

const RUNS=260;
const AR=(hp,mech,nm)=>({name:nm,hp,atk:52,def:22,mech:mech||null});
const battles=[
  ["新号 vs 山贼(d1小怪)",P1,foes.shanzei,false],
  ["少林Lv4 vs 蒙古兵(d3小怪)",P3,foes.menggu,false],
  ["少林Lv4 vs 嵩山弟子(d3小怪)",P3,foes.songdi,false],
  ["华山Lv6 vs 星宿弟子(d5小怪)",P4,foes.xingxiu,false],
  ["华山Lv6 vs 黑木崖杀手(d5小怪)",P4,foes.heimu,false],
  ["武当Lv8 vs 西夏武士(d6小怪)",P6,foes.wangchong,false],
  ["山贼毕业 vs b1 守关",P2,foes.b1,false],
  ["少林Lv4 vs b2(铁壁)",P3,foes.b2,false],
  ["华山Lv6 vs b3(蚀毒)",P4,foes.b3,false],
  ["华山Lv7 vs b4(强铁壁)",P5,foes.b4,false],
  ["武当Lv8 vs b5(迅捷)",P6,foes.b5,false],
  ["武当Lv8 vs 欧阳锋(蚀毒)",P6,foes.oyfeng,false],
  ["武当Lv8 vs 金轮法王(铁壁)",P6,foes.jinlun,false],
  ["论剑初 P7 vs 王重阳 6200",P7,AR(6200,null,"王重阳"),true],
  ["论剑名 P7 vs 乔峰·iron 5600",P7,AR(5600,"iron","乔峰"),true],
  ["论剑名 P7 vs 张三丰·swift 6500",P7,AR(6500,"swift","张三丰"),true],
  ["论剑名 P7 vs 扫地僧·poison 6600",P7,AR(6600,"poison","扫地僧"),true],
  ["论剑天下 P8 vs 东方·swift 9000",P8,AR(9000,"swift","东方不败"),true],
  ["论剑天下 P8 vs 扫地·iron2 6000",P8,AR(6000,"iron2","扫地僧·圆满"),true],
  ["论剑天下 P8 vs 独孤·swift 9500",P8,AR(9500,"swift","独孤求败·剑意"),true],
  ["论剑天下 P8 vs 王重阳·stance 8000",P8,AR(8000,"stance","王重阳·姿态"),true]
];

function scanHp(P, mech, nm, hps){
  console.log(`\n[扫描] ${P.name} vs ${nm} mech=${mech||"无"} (atk52/def22)`);
  for(const hp of hps){
    const r=mc(P,AR(hp,mech,nm),true,Math.min(RUNS,220));
    console.log(`  hp=${hp}\t胜率${(r.winRate*100).toFixed(0)}%\t均耗${r.avg==null?"-":r.avg}s\t死${(r.deathRate*100).toFixed(0)}%(${r.avgDeath==null?"-":r.avgDeath+"s"})\t超时${(r.timeRate*100).toFixed(0)}%`);
  }
}
// 用真实敌人攻防、只替换血量的扫描（用于 b1-b5 / 五绝）
function scanFoeHp(P, foeSeed, nm, hps, override){
  console.log(`\n[扫描] ${P.name} vs ${nm} (真实攻防 atk${foeSeed.atk}/def${foeSeed.def})`);
  for(const hp of hps){
    const f=Object.assign({},foeSeed,{name:nm,hp,maxHp:hp,mech:override||foeSeed.mech||null});
    const r=mc(P,f,true,Math.min(RUNS,220));
    console.log(`  hp=${hp}\t胜率${(r.winRate*100).toFixed(0)}%\t均耗${r.avg==null?"-":r.avg}s\t死${(r.deathRate*100).toFixed(0)}%(${r.avgDeath==null?"-":r.avgDeath+"s"})\t超时${(r.timeRate*100).toFixed(0)}%`);
  }
}

function runTable(){
  console.log("== BAL:", JSON.stringify(BAL));
  console.log("对局\t胜率\t均耗(s)\t死亡\t超时");
  for(const [nm,P,foe,ns] of battles){
    const r=mc(P,foe,ns,RUNS);
    console.log(`${nm}\t${(r.winRate*100).toFixed(1)}%\t${r.avg==null?"N/A":r.avg}\t${(r.deathRate*100).toFixed(0)}%\t${(r.timeRate*100).toFixed(0)}%`);
  }
}

// —— 最终候选参数验证 ——
TUNE.hpMul={1:5.8,3:6.8,5:8,6:8.2,7:6.6,9:8.6};
TUNE.bossHpMul={1:11,3:6.5,5:7,6:4.5,7:6.5,9:6.5};
applyTune();
runTable();
scanFoeHp(P4, foes.b3, "b3(新血线下复核)", [2940]);
scanHp(P7, "poison", "扫地僧6600复核", [6600]);
