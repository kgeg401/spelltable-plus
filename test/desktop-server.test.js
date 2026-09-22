import test from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {startServer} from '../desktop/server.js';
test('four seats, fifth rejection, reconnect ownership, bounds and leave',async()=>{
 const backend=await startServer(process.cwd(),0),clients=[];
 const connect=async()=>{const ws=new WebSocket(`ws://127.0.0.1:${backend.server.address().port}`);clients.push(ws);ws.messages=[];ws.on('message',r=>ws.messages.push(JSON.parse(r)));await new Promise(r=>ws.once('open',r));return ws;};
 const send=(ws,m)=>ws.send(JSON.stringify(m));
 const wait=async(ws,predicate)=>{for(let i=0;i<100;i++){const value=ws.messages.find(predicate);if(value)return value;await new Promise(r=>setTimeout(r,10));}throw Error('No expected message');};
 try{
  const host=await connect();send(host,{type:'join',create:true,token:'host',name:'Host'});const state=await wait(host,m=>m.type==='state'),room=state.room;
  for(let i=1;i<4;i++){const ws=await connect();send(ws,{type:'join',room,token:`p${i}`});await wait(ws,m=>m.type==='joined');}
  const fifth=await connect();send(fifth,{type:'join',room,token:'fifth'});assert.match((await wait(fifth,m=>m.type==='error')).message,/four players/);
  send(host,{type:'counter',field:'poison',delta:-1});send(host,{type:'counter',field:'life',delta:-1});await wait(host,m=>m.type==='state'&&m.players[0].life===39);
  const reconnect=await connect();send(reconnect,{type:'join',room,token:'host'});const resumed=await wait(reconnect,m=>m.type==='state');assert.equal(resumed.players.length,4);assert.equal(resumed.players[0].life,39);assert.equal(resumed.players[0].poison,0);
  send(reconnect,{type:'leave'});await new Promise(r=>setTimeout(r,30));send(fifth,{type:'join',room,token:'fifth'});await wait(fifth,m=>m.type==='joined');
 }finally{for(const ws of clients)ws.terminate();await backend.close();}
});
