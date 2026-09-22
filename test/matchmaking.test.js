import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {WebSocket} from 'ws';
import {attachMatchmaking} from '../server/matchmaking.js';
async function fixture(t,options={}){
 const server=http.createServer(),hub=attachMatchmaking(server,options),sockets=[];await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(async()=>{for(const ws of sockets)ws.terminate();hub.close();await new Promise(r=>server.close(r));});
 return {hub,async client(name){const ws=new WebSocket(`ws://127.0.0.1:${server.address().port}`);sockets.push(ws);ws.messages=[];ws.on('message',r=>ws.messages.push(JSON.parse(r)));await new Promise(r=>ws.once('open',r));ws.sendMessage=m=>ws.send(JSON.stringify({token:`identity-${name}-00000000000000`,name,...m}));return ws;}};
}
async function wait(ws,predicate){for(let i=0;i<100;i++){const m=ws.messages.find(predicate);if(m)return m;await new Promise(r=>setTimeout(r,10));}throw Error('Expected response did not arrive');}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
test('keyword queue joins only a compatible public table; cancellation and capacity are atomic',async t=>{
 const f=await fixture(t),host=await f.client('host'),queued=await f.client('waiting'),cancelled=await f.client('cancelled');
 queued.sendMessage({type:'queue',include:'BR3 no mox',exclude:'tournament'});cancelled.sendMessage({type:'queue',include:'BR3 no mox'});cancelled.sendMessage({type:'queue-cancel'});await wait(cancelled,m=>m.type==='queue'&&!m.active);
 host.sendMessage({type:'join',create:true,public:true,title:'BR3 tournament no mox'});await wait(host,m=>m.type==='joined');await delay(40);assert(!queued.messages.some(m=>m.type==='joined'));
 const privateHost=await f.client('private');privateHost.sendMessage({type:'join',create:true,title:'BR3 no mox'});await wait(privateHost,m=>m.type==='joined');await delay(20);assert(!queued.messages.some(m=>m.type==='joined'));
 const good=await f.client('good');good.sendMessage({type:'join',create:true,public:true,title:'Bracket 3 no mox casual'});await wait(queued,m=>m.type==='joined');assert(!cancelled.messages.some(m=>m.type==='joined'));
 const racers=await Promise.all([f.client('r1'),f.client('r2'),f.client('r3')]);for(const ws of racers)ws.sendMessage({type:'queue',include:'BR3 no mox',exclude:'tournament'});
 await delay(100);assert.equal(racers.filter(ws=>ws.messages.some(m=>m.type==='joined')).length,2);assert.equal(f.hub.queue.size,1);
 cancelled.sendMessage({type:'list'});const list=await wait(cancelled,m=>m.type==='rooms');assert.equal(list.rooms.length,2);assert(list.rooms.every(r=>r.title!=='BR3 no mox'));
});
test('only host moderates; locked tables reject joins; kicked identity cannot reclaim a seat',async t=>{
 const f=await fixture(t),host=await f.client('host'),guest=await f.client('guest');host.sendMessage({type:'join',create:true,public:true});const room=(await wait(host,m=>m.type==='state')).room;
 guest.sendMessage({type:'join',room});const guestId=(await wait(guest,m=>m.type==='joined')).id;guest.sendMessage({type:'lock',locked:true});assert.match((await wait(guest,m=>m.type==='error')).message,/Only the host/);
 host.sendMessage({type:'lock',locked:true});await wait(host,m=>m.type==='state'&&m.locked);const next=await f.client('next');next.sendMessage({type:'join',room});assert.match((await wait(next,m=>m.type==='error')).message,/locked/);
 host.sendMessage({type:'kick',id:guestId});await wait(guest,m=>m.type==='kicked');host.sendMessage({type:'lock',locked:false});await delay(20);guest.sendMessage({type:'join',room});assert.match((await wait(guest,m=>m.type==='error'&&/removed/.test(m.message))).message,/removed/);
});
test('disconnected seats expire and queued player fills vacancy',async t=>{
 const f=await fixture(t,{reconnectMs:80}),host=await f.client('host');host.sendMessage({type:'join',create:true,public:true,title:'BR4'});const room=(await wait(host,m=>m.type==='state')).room;
 const guests=await Promise.all([f.client('g1'),f.client('g2'),f.client('g3')]);for(const ws of guests){ws.sendMessage({type:'join',room});await wait(ws,m=>m.type==='joined');}
 const waiting=await f.client('waiting');waiting.sendMessage({type:'queue',include:'BR4'});guests[0].terminate();await wait(waiting,m=>m.type==='joined');assert.equal(f.hub.rooms.get(room).players.size,4);
});
test('short identities rejected and relay credentials are issued per session without shared secrets',async t=>{
 const f=await fixture(t,{turnUrls:['turn:relay.example:3478'],turnSecret:'server-only-secret'}),bad=await f.client('bad');bad.sendMessage({type:'join',create:true,token:'short'});await wait(bad,m=>m.type==='error');assert.equal(f.hub.rooms.size,0);
 const good=await f.client('good');good.sendMessage({type:'join',create:true});const ice=await wait(good,m=>m.type==='ice');assert.equal(ice.iceServers.length,1);assert(ice.iceServers[0].credential);assert(!JSON.stringify(ice).includes('server-only-secret'));
});
