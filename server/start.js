import http from 'node:http';
import {attachMatchmaking} from './matchmaking.js';
const port=Number(process.env.PORT||47832),host=process.env.HOST||'127.0.0.1';
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');if(req.url==='/health'){res.end(JSON.stringify({ok:true,service:'spelltable-plus-matchmaking'}));}else{res.writeHead(404).end(JSON.stringify({error:'Not found'}));}});
const hub=attachMatchmaking(server,{
 allowedOrigins:(process.env.ALLOWED_ORIGINS||'http://127.0.0.1:47831').split(','),
 iceServers:process.env.STUN_URLS?[{urls:process.env.STUN_URLS.split(',')}]:[],
 turnUrls:process.env.TURN_URLS?.split(','),turnSecret:process.env.TURN_SECRET,
});
server.listen(port,host,()=>console.log(`Matchmaking listening on ${host}:${port}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{hub.close();server.close(()=>process.exit(0));});
