// Uses a locally extracted coturn in WSL. No public listener or machine-wide install.
import http from 'node:http';
import net from 'node:net';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {writeFile,mkdir,readFile} from 'node:fs/promises';
import {createWriteStream,existsSync} from 'node:fs';
import path from 'node:path';
import electron from 'electron';
import {attachMatchmaking} from '../server/matchmaking.js';
const packaged=process.argv.includes('--packaged'),soak=process.argv.find(arg=>arg.startsWith('--soak-seconds='));
const root=path.resolve('.recognition/coturn');
const linuxRoot='/mnt/'+root[0].toLowerCase()+root.slice(2).replaceAll('\\','/');
if(!existsSync(path.join(root,'root/usr/bin/turnserver')))throw Error('Prepare the local coturn test runtime before running this harness.');
const secret=randomBytes(32).toString('hex');
await writeFile(path.join(root,'test.conf'),`listening-port=34780\nlistening-ip=127.0.0.1\nrelay-ip=127.0.0.1\nno-udp\nno-tls\nno-dtls\nno-cli\nno-tcp-relay\nallow-loopback-peers\nno-multicast-peers\nfingerprint\nrealm=spelltable-local-test\nuse-auth-secret\nstatic-auth-secret=${secret}\nuserdb=${linuxRoot}/users.sqlite\npidfile=${linuxRoot}/turn.pid\nlog-file=stdout\nsimple-log\n`);
const relay=spawn('wsl.exe',['-d','Ubuntu','--exec','env',`LD_LIBRARY_PATH=${linuxRoot}/root/usr/lib/x86_64-linux-gnu`,`${linuxRoot}/root/usr/bin/turnserver`,'-c',`${linuxRoot}/test.conf`],{windowsHide:true});
const logs=createWriteStream(path.join(root,'turn.log'));relay.stdout.pipe(logs);relay.stderr.pipe(logs);
const server=http.createServer((req,res)=>res.writeHead(404).end());
const hub=attachMatchmaking(server,{allowedOrigins:['http://127.0.0.1:47831'],turnUrls:['turn:127.0.0.1:34780?transport=tcp'],turnSecret:secret});
let code=1;
try{
 let ready=false;for(let i=0;i<100;i++){if(relay.exitCode!==null)throw Error('coturn exited during startup; inspect private turn.log');ready=await new Promise(resolve=>{const socket=net.connect(34780,'127.0.0.1');socket.setTimeout(200);socket.on('connect',()=>{socket.destroy();resolve(true);});socket.on('error',()=>resolve(false));socket.on('timeout',()=>{socket.destroy();resolve(false);});});if(ready)break;await new Promise(r=>setTimeout(r,200));}
 if(!ready)throw Error('Local coturn listener did not become ready');
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(47833,'127.0.0.1',resolve);});
 const executable=packaged?path.resolve('release/SpellTablePlus-win32-x64/SpellTablePlus.exe'):electron;
 code=await new Promise((resolve,reject)=>{const child=spawn(executable,[...(packaged?[]:['.']),'--four-players','--verify','--verify-matchmaking','--verify-media','--verify-relay','--verify-recognition','--server=ws://127.0.0.1:47833',...(soak?[soak]:[])],{stdio:'inherit'});child.once('error',reject);child.once('exit',(code,signal)=>signal?reject(Error(`Desktop verification terminated: ${signal}`)):resolve(code??1));});
 await mkdir('desktop-test-results',{recursive:true});await writeFile('desktop-test-results/relay.json',JSON.stringify({time:new Date().toISOString(),exitCode:code,packaged,provider:'local coturn in WSL',transport:'TURN over TCP',evidence:packaged?'release/SpellTablePlus-win32-x64/desktop-test-results/verification.json':'desktop-test-results/verification.json'},null,2));
}finally{
 hub.close();server.close();
 try{const pid=(await readFile(path.join(root,'turn.pid'),'utf8')).trim();if(/^\d+$/.test(pid))await new Promise(resolve=>{const stop=spawn('wsl.exe',['-d','Ubuntu','--exec','kill','-TERM',pid],{windowsHide:true,stdio:'ignore'});stop.on('exit',resolve);stop.on('error',resolve);});}catch{}
 relay.kill();logs.end();
}
process.exitCode=code||0;
