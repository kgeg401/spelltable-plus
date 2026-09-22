import {randomBytes,createHash,createHmac} from 'node:crypto';
import {WebSocketServer,WebSocket} from 'ws';
import {matches,moxfieldURL} from '../src/core.js';

const text=(value,length)=>String(value??'').trim().slice(0,length);
const identity=value=>createHash('sha256').update(value).digest('hex');
export function attachMatchmaking(server,options={}) {
 const rooms=new Map(),queue=new Map(),connections=new Set();
 const reconnectMs=options.reconnectMs??120000,roomLifetime=options.roomLifetime??12*60*60*1000;
 const send=(ws,data)=>{if(ws.readyState===WebSocket.OPEN&&ws.bufferedAmount<1_000_000)ws.send(JSON.stringify(data));};
 const error=(ws,message)=>send(ws,{type:'error',message});
 const wss=new WebSocketServer({server,maxPayload:65536});
 const publicRooms=()=>[...rooms.values()].filter(r=>r.public&&!r.locked&&[...r.players.values()].some(p=>p.online)).map(r=>({code:r.code,title:r.title,players:r.players.size,open:r.players.size<4,created:r.created}));
 const list=()=>{const data={type:'rooms',rooms:publicRooms()};for(const ws of connections)if(ws.subscribed)send(ws,data);};
 function broadcast(room){const data={type:'state',room:room.code,title:room.title,public:room.public,locked:room.locked,host:room.host,players:[...room.players.values()].map(({ws,key,disconnected,...p})=>p),chat:room.chat};for(const p of room.players.values())send(p.ws,data);list();}
 function credentials(ws){
  const iceServers=[...(options.iceServers||[])];
  if(options.turnSecret&&options.turnUrls?.length){const username=`${Math.floor(Date.now()/1000)+3600}:${randomBytes(8).toString('hex')}`;iceServers.push({urls:options.turnUrls,username,credential:createHmac('sha1',options.turnSecret).update(username).digest('base64')});}
  send(ws,{type:'ice',iceServers});
 }
 function validateIdentity(m){return typeof m.token==='string'&&m.token.length>=16&&m.token.length<=128;}
 function join(ws,room,m){
  if(!validateIdentity(m)){error(ws,'Invalid session identity.');return false;}
  const key=identity(m.token),prior=[...room.players.values()].find(p=>p.key===key);
  if(room.banned.has(key)){error(ws,'You were removed from this table.');return false;}
  if(room.locked&&!prior){error(ws,'This table is locked.');return false;}
  if(!prior&&room.players.size>=4){error(ws,'This room already has four players.');return false;}
  const player=prior||{id:randomBytes(10).toString('hex'),key,name:text(m.name,32)||'Player',life:40,poison:0,commander:'',deck:'',link:''};
  if(prior&&prior.ws!==ws){prior.ws.context=null;send(prior.ws,{type:'replaced'});prior.ws.close();}
  player.ws=ws;player.online=true;delete player.disconnected;room.players.set(player.id,player);room.host ||=player.id;ws.context={room,player};queue.delete(ws);
  send(ws,{type:'joined',id:player.id});credentials(ws);broadcast(room);return true;
 }
 function drain(){
  for(const [ws,m] of queue){if(ws.readyState!==WebSocket.OPEN){queue.delete(ws);continue;}
   const key=identity(m.token);
   const room=[...rooms.values()].filter(r=>r.public&&!r.locked&&r.players.size<4&&!r.banned.has(key)&&[...r.players.values()].some(p=>p.online)&&matches(r.title,m.include,m.exclude)).sort((a,b)=>b.players.size-a.players.size||a.created-b.created)[0];
   if(room)join(ws,room,m);
  }
 }
 function leave(ws,reason){
  const ctx=ws.context;if(!ctx)return;
  const {room,player}=ctx;room.players.delete(player.id);ws.context=null;
  if(room.host===player.id)room.host=[...room.players.values()].find(p=>p.online)?.id||room.players.keys().next().value;
  if(reason)send(ws,{type:reason});
  if(!room.players.size)rooms.delete(room.code);else broadcast(room);
  list();drain();
 }
 wss.on('connection',(ws,request)=>{
  const origin=request.headers.origin;
  const allowed=options.allowedOrigins||[`http://127.0.0.1:${server.address().port}`];
  if(origin&&!allowed.includes(origin)){ws.close(1008,'Origin not allowed');return;}
  if(connections.size>=(options.maxConnections||500)){ws.close(1013,'Server busy');return;}
  connections.add(ws);ws.alive=true;ws.on('pong',()=>ws.alive=true);
  let tokens=80,last=Date.now();
  ws.on('message',raw=>{
   const now=Date.now();tokens=Math.min(80,tokens+(now-last)*.02);last=now;if(tokens<1){error(ws,'Please slow down.');return;}tokens--;
   try{
    const m=JSON.parse(raw);if(!m||typeof m.type!=='string')throw Error('Invalid message.');
    if(m.type==='list'){ws.subscribed=true;send(ws,{type:'rooms',rooms:publicRooms()});return;}
    if(m.type==='queue-cancel'){queue.delete(ws);send(ws,{type:'queue',active:false});return;}
    if(m.type==='queue'){
     if(ws.context)throw Error('Leave your current table first.');if(!validateIdentity(m))throw Error('Invalid session identity.');
     if(!text(m.include,300))throw Error('Enter matchmaking keywords.');
     queue.set(ws,{token:m.token,name:text(m.name,32),include:text(m.include,300),exclude:text(m.exclude,300)});send(ws,{type:'queue',active:true});drain();return;
    }
    if(m.type==='join'){
     if(ws.context)throw Error('Leave your current table first.');if(!validateIdentity(m))throw Error('Invalid session identity.');
     let room;
     if(m.create){if(rooms.size>=250)throw Error('Room limit reached.');const code=randomBytes(4).toString('hex').toUpperCase();room={code,title:text(m.title,120)||'Private Commander table',public:m.public===true,locked:false,created:now,players:new Map(),banned:new Set(),chat:[],host:null};rooms.set(code,room);}
     else room=rooms.get(text(m.room,8).toUpperCase());
     if(!room)throw Error('Room not found.');join(ws,room,m);drain();return;
    }
    const ctx=ws.context;if(!ctx)throw Error('Join a table first.');const {room,player}=ctx;
    if(player.ws!==ws)throw Error('Session replaced.');
    if(m.type==='ice-refresh'){credentials(ws);return;}
    if(m.type==='media'){player.media={video:m.video===true,audio:m.audio===true};broadcast(room);return;}
    if(m.type==='signal'){const target=room.players.get(m.to);if(target?.online&&m.data&&JSON.stringify(m.data).length<50000)send(target.ws,{type:'signal',from:player.id,data:m.data});return;}
    if(m.type==='counter'){if(!['life','poison'].includes(m.field)||![1,-1].includes(m.delta))throw Error('Invalid counter change.');player[m.field]=Math.max(m.field==='life'?-999:0,Math.min(999,player[m.field]+m.delta));}
    else if(m.type==='loadout'){const link=moxfieldURL(m.link||'');player.commander=text(m.commander,120);player.deck=text(m.deck,80);player.link=link;}
    else if(m.type==='chat'){if(text(m.text,1000)){room.chat.push({name:player.name,text:text(m.text,1000)});room.chat=room.chat.slice(-100);}}
    else if(m.type==='lock'){if(room.host!==player.id)throw Error('Only the host can lock a table.');room.locked=!!m.locked;}
    else if(m.type==='kick'){if(room.host!==player.id)throw Error('Only the host can remove players.');const target=room.players.get(m.id);if(!target||target.id===player.id)throw Error('Invalid player.');room.banned.add(target.key);leave(target.ws,'kicked');}
    else if(m.type==='leave'){leave(ws,'left');return;}
    else throw Error('Unknown message.');
    broadcast(room);drain();
   }catch(e){error(ws,e.message||'Invalid request.');}
  });
  ws.on('close',()=>{connections.delete(ws);queue.delete(ws);const ctx=ws.context;if(ctx&&ctx.player.ws===ws){ctx.player.online=false;ctx.player.disconnected=Date.now();if(ctx.room.host===ctx.player.id)ctx.room.host=[...ctx.room.players.values()].find(p=>p.online)?.id||ctx.player.id;broadcast(ctx.room);}});
 });
 const cleanup=setInterval(()=>{
  const now=Date.now();for(const room of rooms.values()){
   if(now-room.created>roomLifetime){for(const p of room.players.values()){p.ws.context=null;send(p.ws,{type:'expired'});}rooms.delete(room.code);continue;}
   for(const p of [...room.players.values()])if(!p.online&&now-p.disconnected>reconnectMs)leave(p.ws);
  }
  list();drain();
 },Math.min(reconnectMs,10000));cleanup.unref();
 const heartbeat=setInterval(()=>{for(const ws of connections){if(!ws.alive){ws.terminate();continue;}ws.alive=false;ws.ping();}},30000);heartbeat.unref();
 return {wss,rooms,queue,close(){clearInterval(cleanup);clearInterval(heartbeat);for(const ws of connections)ws.terminate();wss.close();}};
}
