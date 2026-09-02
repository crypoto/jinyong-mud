# 金庸MUD · index.html 代码地图（供 AI Agent 快速定位）

> **本文件目的**：让 AI 改代码前 30 秒内定位目标，不必通读 2610 行源码，节省 token。
> **适用对象**：`workspace/claude-code-workspace-master/claude-code-workspace-master/02_游戏开发/金庸MUD/index.html`
> **档案生成日**：2026-09-02（此后如编辑导致行号漂移，用"函数名/常量名"全局搜索定位；大改后建议顺手更新行号）。

## 0. 工程本质（先读这一段）

- **单文件文字放置类 RPG**：2610 行 / 143KB，无构建、无 npm、无外部请求、无图片（纯 HTML+CSS+JS，字体图形用 CSS 实现）。
- **运行方式**：浏览器直接双击打开即玩；数据全部存 `localStorage`，30 秒自动存档 + 手动存档。
- **玩法一句话**：散人开局 → 跑图/拜师/学武 → 野外遇怪/副本挂机（打怪经验只喂武功层数、打工银两买装备）→ 装备打磨颜色继承 → 挑战「华山论剑」三级（初/名/天下，逐级解锁，多修判定）。
- **规则权威**：`GDD.md`（本目录）是玩法/数值唯一权威来源；代码注释大量引用其章节号（如 `GDD §5.2`）。
- **自检工具**：`_check.js`（本目录）→ 提取 `<script>` 做 JS 语法校验：`node _check.js` 输出 `JS SYNTAX OK` 即过。

## 1. 文件三段布局

| 区段 | 行号 | 内容 |
|---|---|---|
| CSS | 7 – 194 | 全部样式（分节注释：@140 常驻小地图，@161 实时战斗 HUD） |
| HTML | 199 – 319 | 三屏 + 战斗条 + 弹窗骨架（详见 §6） |
| `<script>` | 321 – 2606 | 全部逻辑，A1–A6 六大区（`//#A1_END` 等标记各分区末尾） |

### JS 六大分区
| 区 | 标题注释 | 行号 | 负责 |
|---|---|---|---|
| A1 | 数据配置 | 327 – 624 | 全部静态数据表（武功/门派/地点/敌人/装备/平衡） |
| A2 | 工具/状态/公式/存档 | 625 – 875 | 全局 `S`、角色/装备/公式、localStorage |
| A3 | UI：日志/侧栏/面板 | 876 – 1287 | 日志流、侧栏、各功能面板、创建流程 |
| A4 | 世界：移动/拜师/主线 | 1288 – 1775 | 地点事件、副本入口、NPC 师傅、任务引导 |
| A5 | 挂机与全局时钟 | 1776 – 1855 | 挂机结算、离线结算、setInterval 时钟 |
| A6 | 战斗引擎/论剑/指令 | 1856 – 2606 | 自动战斗引擎、标签机制、论剑、小地图、启动 |

## 2. 全局运行时状态（最关键的认知）

- `S` 全局单例（L636）：`{slot, loc, P, combat, idle}`。几乎所有函数都读写它。
  - `S.P` = 玩家状态，**字段由 `freshP()`（L639）统一定义**：attrs{str,agi,int,con,luck}、hp/mp/foot/footTs、gold、gear{5槽}、equipped{outer[3],inner,light}、learned{id→{lv,exp,spent}}、sect、flags{}、quest、expPool、title 等。
  - `S.combat` = 战斗状态（`newCombat` L1882 构建）：`{foe, foeDb, stance, defend, atkT, enemyAt, ...}`。
  - `S.idle` = 挂机状态（L1777 `startIdle` 构建）。
- **战斗节奏核心**：`setInterval` 每 250ms（L1993）驱动一切：
  - `foe.hp<=0 → winCombat()`（L2339）；`S.P.hp<=0 → loseCombat()`（L2400）
  - `c.enemyAt<=now → foeTurn()`（敌人独立攻击节拍）；`c.atkT<=now → playerCycle()`（玩家自动节拍）
- **其他时钟**：10s 脚力回复+挂机结算（L1844）；30s 自动存档（L1854）。**玩家不手动操作也能打完战斗**，AI 测试多用 console 改 `S`。
- **视图切换**：`setScreen(n)` L878；`screen-title/create/game` 三个屏互斥（HTML L200/215/237）。
- **禁区提示**：不要破坏 3 个 `setInterval` 与其驱动节拍模型（玩家/敌人各自独立节拍，非回合制轮询）；战斗按钮操作需先查 `stateInCombat()`（L1293）。

## 3. 数据表速查（A1 区，字段格式决定改法）

| 常量 | 行 | 内容 / 元素格式 |
|---|---|---|
| `RARITY`/`TIER_COEF` | 330/331 | 档位 基础/进阶/高级/绝学；威力系数 1/1.3/1.6/2 |
| `LVL_NAME`/`LVL_POW`/`SK_EXP` | 333-335 | 武功九层名称/层威力/升层经验 |
| `TAG_NAME` | 347 | **标签字典**：`m段击 crit会心 db破防 ig无视闪避 st点穴 dot毒伤 ex斩杀 cb连击 ls吸血 dm吸内 iv无敌 sh护盾 rf反弹 pa/pd/ph/ps 攻防血速加成 pr回气 dodge身法闪避 df左右互搏` |
| `_SK` → `SK` | 349 – 434 | **武功表**。行格式 `[id,name,type,rarity,mp,标签串]`；type 0外/1内/2轻；标签串如 `"m:18|ig"`、`"dot:10,3|crit:0.25,1.5"`，由 `parseTags`(L431) 解析为 `{k, a:[]}` 数组（`a` 为数值参数） |
| `SEC` | 437 – 512 | **门派**：`{nm,loc,intro,t:[师傅{nm,teach[],hint?}],up:[升档条件],conds:[...]}`，师傅链第 4 位多为隐藏（`hint` 触发线索） |
| `SAN_T` | 515 – 523 | 散人通用师傅链 8 位（王教头→…→周伯通·隐），解锁判定在 `sanAvail`(L1645) |
| `LOCS` | 526 – 544 | **地图**：`{nm, kind:city\|wild\|peak, d难度, desc, ex:[["方向","目标id"]], dg?副本}` |
| `_EN` → `EN` | 548 – 569 | **敌人**：行 `[id,name,d,hp,atk,def,exp,gold,stone,desc,mech?]`；`mech` 为标签 Boss 机制（见下）；`boss` 判定 L569 |
| `MECH_NM`/`MECH_CNT` | 571 – 576 | Boss 机制名与克制提示文案：iron/iron2 铁壁、poison 蚀毒、swift 迅捷、stance 姿态轮转 |
| `DG` | 578 – 583 | 野外副本挂机点：`{boss,exp,gold,stone,txt}` |
| `ITEMS` | 585 – 589 | 药品：`{name,desc,price,heal,mp}` |
| `GEAR_NAME`/`COLOR`/`COLOR_X`/`POLISH_COST` | 592 – 608 | 装备名(槽×9级)/颜色/颜色倍率/打磨花费（GDD §10.3） |
| `WORK_GOLD`/`FOOT_MAX` | 610/611 | 打工银两（按城市难度）/脚力上限 |
| `BAL` | 615 – 623 | **战斗平衡总旋钮**：pAtk 玩家招式系数、hpMul/bossHpMul 双轨血线等。**改数值平衡都先来这里**，勿散改函数内硬编码 |
| `ARENA_T2`/`ARENA_T3` | 2419/2424 | 论剑·名/天下 的守擂阵容表 |
| `MINI_XY`/`MINI_NM`/`MINI_HEX` | 2489-2491 | 小地图节点坐标/名/颜色 |

## 4. 核心函数导航（改哪里看哪里）

### 状态/公式/存档（A2）
`getStats(P)` L726 —— 属性汇总（攻/防/血/蓝/闪避/出手，含被动），**改属性公式在此**
`passive` L701 / `lightDodge` L719 —— 被动加成、轻功身法闪避（克制 swift 的实现入口）
`gearBase/makeGear/recolorGear` L666/671/679 —— 装备数值与淬色重算（**颜色继承逻辑在此**）
`lvUpCheck` L743；`readMeta/writeMeta/snapshot/saveSlot/loadSlot/deleteSlot/exportSlot/importSlotTo/saveGame` L751-830 —— 存档（键：`jyjh_meta_v1` / `jyjh_slot_1..3`，`SAVE_VER` L634）

### UI 渲染（A3）
`log/sep/clearLog` L882-893 —— 日志流；`renderSidebar` L919 —— 侧栏（每 10s 刷新）
`showActions` L979 —— 底部按钮组；`homeBack/baseActions` L989-990
`showSkillsPanel/investExp/equipFit/equipSkill/unequipSkill/forgetSkill` L993-1093 —— 武功面板（修炼/装备/遗忘）
`showGearPanel/showPolish` L1096/1137 —— 装备与打磨
`showBag/useItem` L1163/1181；`showStatus/showJournal/showHelp` L1191-1211
创建流程：`startNewGame/renderAttrAlloc/alloc/enterWorld/enterGame` L1215-1283

### 世界/事件（A4）
`onEnterLocation` L1321 —— **每次进入地点生成操作列表**（城市功能/拜师入口/副本/野外移动都在此汇聚），`extraLocEvents` L1389 追加特殊事件
`moveTo/lookAround` L1295/1315；`showStation/workPanel/showMarket` L1411-1471（传送/打工/市集）
`dungeonMenu` L1474；`tryEncounter` L1498 —— 野外遇怪（用 `ENC_D` L1291 按难度取池）
`joinSectPanel/joinSect/sectMasterPanel/sectHiddenOk` L1518-1607 —— 拜师/升档/隐藏师傅
`exploreSiyagu/exploreJianzhong` L1609/1629 —— 门派奇遇（扫地、思过崖）
`sanAvail/sanTeacher/baixiaosheng` L1645-1707 —— 散人师傅判定与面板
`learnSkill` L1710 —— 学武（上限 MAX_LEARN=15）
主线：`questInfo/questGuide/checkQuest` L1722/1734/1754（6 章引导）

### 挂机（A5）
`startIdle/stopIdle/idleRates/idleApply/settleOffline` L1777-1841；`STONE_MINUTE` L1812

### 战斗引擎（A6，最复杂区）
| 函数 | 行 | 职责 |
|---|---|---|
| `combatCfg`/`startCombat`/`newCombat`/`renderCombat` | 1857/1869/1882/1896 | 构建战斗（foe 按难度/档位扩血） |
| `btBuild`/`btUpdate`/`toggleAuto` | 1910/1941/1935 | 实时 HUD 技能按钮与血条刷新 |
| `skillCd`/`playerGap`/`enemyGap`/`dbLive` | 1978-1990 | 冷却/出手节拍/破防窗口判定 |
| `castSkill` | 2014 | 施招入口（含左右互搏双发） |
| `skillAtk` | 2054 | 单招伤害数学模型（段数/会心/命中） |
| `strikeFlavor` | 2064 | **演出层**：招式宣告文案（改出招台词在这） |
| `strike` | 2102 | **逐段伤害与全部机制结算核心**（段击/破防/斩杀/点穴/吸血吸内/施毒都在此），每门武功差异化手感在此体现 |
| `playerNormal/Defend/Flee` | 2161-2191 | 玩家普攻/防御/逃跑 |
| `combatItem`/`afterCast` | 2191/2201 | 战斗中用药；收招后登记下次出手 |
| `playerCycle`/`regenMp`/`autoPick` | 2209-2246 | **玩家自动节拍与 AI 选招策略**（改自动战斗行为来这） |
| `foeMechMode`/`foeTurn`/`foeStrikeOnce` | 2249-2328 | **敌人回合/机制**（护盾/无敌/闪避 dodge 判定、姿态轮转取态都在此） |
| `reflectTotal`/`foeSettle` | 2329/2334 | 反弹总率汇总；敌人护盾/姿态轮转结算 |
| `winCombat`/`loseCombat` | 2339/2400 | 战利品/掉落/败北处理（**掉落与称号授予改这**） |
| 论剑 `arenaMeta/Unlocked/Check/Foe/Fight` | 2444-2487 | 论剑三级门槛（多修判定）、守擂阵容、特殊王重阳（stance 姿态轮转，含称号授予） |
| 小地图/指令 `renderMinimap/mapGo/showMapPanel/submitCommand/goByName` | 2492-2596 | 左上小地图与文字指令解析（`看/地图/去/打坐/驿站…`） |
| 启动 `initTitle()` | 2599-2605 | 绑定弹窗关闭 + 渲染存档栏 |

## 5. 战斗机制 ↔ 克制规则（设计约定，勿破坏）

- 敌人 `mech` 标签（铁壁/蚀毒/迅捷/姿态轮转）是核心差异化，克制提示文案见 `MECH_CNT`（L572）。
- 玩家武功靠标签（`TAG_NAME` L347）实现克制：db 破防破铁壁、sh 护盾消毒雾、iv 无敌+dodge 身法闪避躲迅捷连击、姿态轮转由 `foeMechMode/foeSettle`（L2249/2334）随气血轮转。
- 武功九层威力成长走 `LVL_POW`；装备淬色走 `recolorGear` + `COLOR_X`，换装继承逻辑在 `equipGear` 相关处（面板 L1096 起），**继承发生在换装时槽位高色自动灌注新装、旧装剥白**。
- 数值平衡红线在 `BAL`（L615）：血线有"野怪/守关"双轨标定（注释给出各战斗时长目标）。**手感问题先看 BAL，不要靠大改单招硬编码解决。**

## 6. HTML / DOM id 速查（`$()` 即 `getElementById`，L626）

| id | 行 | 用途 |
|---|---|---|
| `screen-title` / `screen-create` / `screen-game` | 200/215/237 | 三个互斥屏 |
| `slot-list`（存档栏）、`name-input`、`attr-alloc`、`pts-left` | 207/219/228/226 | 标题/创建屏 |
| `quick-stats` | 242 | 顶栏速览 |
| `mm-dock`/`minimap`/`mm-pill` | 254-256 | 常驻小地图 |
| `battle-bar` 及 `bt-foe-*`/`bt-me-*`/`bt-skills`/`bt-tools` | 259-274 | 战斗 HUD（仅战斗中显示，btBuild 填充） |
| `output` | 276 | 日志滚动区 |
| `sidebar` / `action-buttons` / `cmd-input` | 278/281/284 | 侧栏/操作按钮/指令输入 |
| `help-mask` / `confirm-mask`(+`confirm-title/text`) / `import-file` | 292/309/319 | 帮助弹窗/确认框/隐藏导入 input |
| 顶栏按钮（武功/装备/行囊/纪事/地图/存档/帮助） | 243-249 | 直接 `onclick` 绑全局函数 |

## 7. 常见修改场景 → 起手位置（写给下一个 AI）

- **调平衡/手感**：先看 `BAL` L615（血线、伤害系数）→ 需要看具体机制在 `strike` L2102 / `foeTurn` L2253。
- **加武功**：`_SK` L349 加一行（id 全局唯一）→ 决定由谁教：门派加进 `SEC.t[某师傅].teach`，散人加进 `SAN_T` 对应位。
- **加敌人 / 新 Boss 机制**：`_EN` L549 加行（可给 `mech`）→ 若新机制需在 `foeTurn/foeStrikeOnce/foeSettle`（L2253+）实现行为、`MECH_CNT` L572 加文案、帮助页 L296-307 补说明。
- **改出招演出/文案**：`strikeFlavor` L2064、`strike` L2102 的落屏文案，UI 标签提示走 `TAG_NAME` L347。
- **加地点/地图路线**：`LOCS` L526 → 若带怪需 `ENC_D` L1291 补难度池、野外怪走 `tryEncounter` L1498；小地图坐标补 `MINI_XY` L2489。
- **加存档字段**：`freshP` L639 给初值 → `snapshot/loadSlot` L755/771 同步序列化 → **升 `SAVE_VER` L634**（旧档自动作废需防崩）。
- **改主线任务**：`questInfo` 对象 L1724 + `checkQuest` L1754 判定 + 目的地事件 `extraLocEvents` L1389。
- **改论剑门槛**：`arenaCheck/arenaMeta` L2450/2444（多修判定来自 `sectJue/countLv` L2430/2438），阵容 `ARENA_T2/T3` L2419/2424。

## 8. 给 AI 的省 token 工作法（推荐流程）

1. 先读本文件 §0 + §2，理解 `S` 与 250ms 心跳模型（不读全文）。
2. 按目标查 §3/§4 定位函数或数据表，用 `read_file` **只读目标 ±20 行**。
3. 数据是"源码注释 + 行内注释"自描述风格，字段说明优先看表定义处注释（如 `_EN` 上方 L545-547）。
4. 改完跑 `node _check.js`（须输出 `JS SYNTAX OK`）；浏览器 F12 看 console；涉及存档结构务必升 `SAVE_VER`。
5. 改玩法/数值后对照 `GDD.md` 相关章节确认一致，避免"实现与设计漂移"。
6. 大改后顺手更新本文档行号（本文件是项目自维护资产，非临时文件）。
