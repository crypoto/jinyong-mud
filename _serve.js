const http=require("http"),fs=require("fs"),path=require("path");
const root="d:/APP/workbuddy/workspace/claude-code-workspace-master/claude-code-workspace-master/02_游戏开发/金庸MUD";
http.createServer((req,res)=>{
  let p=decodeURIComponent(req.url.split("?")[0]); if(p==="/") p="/index.html";
  fs.readFile(path.join(root,p),(e,d)=>{ if(e){res.writeHead(404);res.end("404");return;}
    const ext=path.extname(p).toLowerCase();
    const type=ext===".css"?"text/css; charset=utf-8":ext===".js"?"application/javascript; charset=utf-8":ext===".html"?"text/html; charset=utf-8":"application/octet-stream";
    res.writeHead(200,{"Content-Type":type}); res.end(d); });
}).listen(8123,()=>console.log("serving :8123"));
