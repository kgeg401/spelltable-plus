import http from 'node:http';
import {stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {WebSocketServer,WebSocket} from 'ws';
export async function startServer(root, port=47831, mediaRoot=path.join(root,'.local-media')) {
 const rooms=new Map();
 const server=http.createServer(async(req,res)=>{
  try {
   const url=new URL(req.url,'http://localhost');let file;
   if(url.pathname==='/cards.json') file=path.join(mediaRoot,'cards.json');
   else if(/^\/media\/player-[1-4]\.mp4$/.test(url.pathname)) file=path.join(mediaRoot,path.basename(url.pathname));
   else if(['/','/app.js','/style.css'].includes(url.pathname)) file=path.join(root,'desktop',url.pathname==='/'?'index.html':url.pathname.slice(1));
   else {res.writeHead(404).end();return;}
   const size=(await stat(file)).size;
   const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.mp4':'video/mp4'}[path.extname(file)];
   const headers={'Content-Type':mime,'Content-Security-Policy':"default-src 'self'; connect-src 'self' ws://127.0.0.1:47831; media-src 'self' blob:; style-src 'self'; script-src 'self'",'Accept-Ranges':'bytes'};
   if(req.headers.range){
    const match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);if(!match){res.writeHead(416).end();return;}
    const start=Number(match[1]),end=Math.min(Number(match[2]||size-1),size-1);if(start>end){res.writeHead(416).end();return;}
    res.writeHead(206,{...headers,'Content-Range':`bytes ${start}-${end}/${size}`,'Content-Length':end-start+1});createReadStream(file,{start,end}).pipe(res);
   }else{res.writeHead(200,{...headers,'Content-Length':size});createReadStream(file).pipe(res);}
  }catch{res.writeHead(404).end();}
 });
 const wss=new WebSocketServer({server,maxPayload:65536});
 const send=(ws,data)=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(data));};
 const broadcast=(r)=>{const state={type:'state',room:r.code,host:r.host,players:[...r.players.values()].map(({ws,token,...p})=>p),chat:r.chat};for(const p of r.players.values())send(p.ws,state);};
 wss.on('connection',(ws,request)=>{
  if(request.headers.origin && request.headers.origin!==`http://127.0.0.1:${server.address().port}`){ws.close();return;}
  let room,player;
  ws.on('message',raw=>{try{
   const m=JSON.parse(raw);const fail=message=>send(ws,{type:'error',message});
   if(m.type==='join'){
    if(player)return;let code=String(m.room||'').toUpperCase();
    if(m.create){code=randomBytes(3).toString('hex').toUpperCase();rooms.set(code,{code,players:new Map(),chat:[],host:null});}
    room=rooms.get(code);if(!room)return fail('Room not found.');
    const previous=[...room.players.values()].find(p=>p.token===m.token);
    if(!previous && room.players.size>=4)return fail('This room already has four players.');
    player=previous||{id:randomBytes(8).toString('hex'),token:String(m.token).slice(0,100),name:String(m.name||'Player').slice(0,32),life:40,poison:0,commander:'',deck:'',link:''};
    if(previous?.ws!==ws)previous?.ws?.close();player.ws=ws;player.online=true;room.players.set(player.id,player);room.host ||= player.id;
    send(ws,{type:'joined',id:player.id});broadcast(room);return;
   }
   if(!player)return;
   if(m.type==='signal'){const target=room.players.get(m.to);if(target)send(target.ws,{type:'signal',from:player.id,data:m.data});}
   if(m.type==='counter' && ['life','poison'].includes(m.field) && [1,-1].includes(m.delta)){player[m.field]=Math.max(m.field==='life'?-999:0,Math.min(999,player[m.field]+m.delta));broadcast(room);}
   if(m.type==='loadout'){for(const key of ['commander','deck','link'])player[key]=String(m[key]||'').slice(0,300);broadcast(room);}
   if(m.type==='chat' && typeof m.text==='string' && m.text.trim()){room.chat.push({name:player.name,text:m.text.slice(0,1000)});room.chat=room.chat.slice(-100);broadcast(room);}
   if(m.type==='leave'){room.players.delete(player.id);if(room.host===player.id)room.host=room.players.keys().next().value;player=null;broadcast(room);ws.close();}
  }catch{send(ws,{type:'error',message:'Invalid request.'});}});
  ws.on('close',()=>{if(player && player.ws===ws){player.online=false;broadcast(room);}});
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 return {server,wss,rooms,close:()=>new Promise(resolve=>{for(const c of wss.clients)c.terminate();wss.close();server.close(resolve);})};
}
