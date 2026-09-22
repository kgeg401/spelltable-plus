import http from 'node:http';
import {stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {attachMatchmaking} from '../server/matchmaking.js';

export async function startServer(root, port=47831, mediaRoot=path.join(root,'.local-media')) {

 const server=http.createServer(async(req,res)=>{
  try {
   const url=new URL(req.url,'http://localhost');let file;
   if(url.pathname==='/cards.json') file=path.join(mediaRoot,'cards.json');
   else if(/^\/media\/player-[1-4]\.mp4$/.test(url.pathname)) file=path.join(mediaRoot,path.basename(url.pathname));
   else if(['/','/app.js','/style.css'].includes(url.pathname)) file=path.join(root,'desktop',url.pathname==='/'?'index.html':url.pathname.slice(1));
   else {res.writeHead(404).end();return;}
   const size=(await stat(file)).size;
   const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.mp4':'video/mp4'}[path.extname(file)];
   const headers={'Content-Type':mime,'Content-Security-Policy':"default-src 'self'; connect-src 'self' ws: wss:; media-src 'self' blob:; style-src 'self'; script-src 'self'",'Accept-Ranges':'bytes'};
   if(req.headers.range){
    const match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);if(!match){res.writeHead(416).end();return;}
    const start=Number(match[1]),end=Math.min(Number(match[2]||size-1),size-1);if(start>end){res.writeHead(416).end();return;}
    res.writeHead(206,{...headers,'Content-Range':`bytes ${start}-${end}/${size}`,'Content-Length':end-start+1});createReadStream(file,{start,end}).pipe(res);
   }else{res.writeHead(200,{...headers,'Content-Length':size});createReadStream(file).pipe(res);}
  }catch{res.writeHead(404).end();}
 });
 const hub=attachMatchmaking(server);
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 return {server,wss:hub.wss,rooms:hub.rooms,close:()=>new Promise(resolve=>{hub.close();server.close(resolve);})};
}
