const fs=require("fs"),path=require("path");
const file=path.join(__dirname,"index.html");
const s=fs.readFileSync(file,"utf8");
const m=s.match(/<script>([\s\S]*?)<\/script>/);
if(!m){console.log("no script");process.exit(1);}
try{ new Function(m[1]); console.log("JS SYNTAX OK"); }
catch(e){ console.log("ERR:", e.message); process.exit(1); }
