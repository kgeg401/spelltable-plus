import {app,BrowserWindow,session,ipcMain} from 'electron';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import {startServer} from './server.js';
import {RecognitionWorker} from './recognition-worker.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
const testing=process.argv.includes('--four-players'),verify=process.argv.includes('--verify');
const matchVerify=process.argv.includes('--verify-matchmaking'),recognitionVerify=process.argv.includes('--verify-recognition');
const serverAddress=process.argv.find(arg=>arg.startsWith('--server='))?.slice(9);
const lobbyCapture=process.argv.includes('--capture-lobby');
app.whenReady().then(async()=>{
const recognition=new RecognitionWorker(root,app.isPackaged?process.resourcesPath:null);
ipcMain.handle('recognize-frame',(event,image)=>{if(!event.senderFrame?.url.startsWith('http://127.0.0.1:47831/'))throw Error('Untrusted frame');return recognition.recognize(image);});
app.on('before-quit',()=>recognition.close());
const evidenceRoot=app.isPackaged?path.join(path.dirname(app.getPath('exe')),'desktop-test-results'):path.join(root,'desktop-test-results');
let backend;try{backend=await startServer(root,47831,app.isPackaged?path.join(process.resourcesPath,'local-media'):undefined);}catch(error){if(error.code!=='EADDRINUSE')throw error;}
const windows=[];
for(let i=1;i<=(testing?4:1);i++){
 const partition=`persist:spelltable-${testing?'test-':''}${i}`;
 session.fromPartition(partition).setPermissionRequestHandler((contents,permission,callback)=>callback(contents.getURL().startsWith('http://127.0.0.1:47831/')&&['media','clipboard-sanitized-write'].includes(permission)));
 const win=new BrowserWindow({width:1440,height:940,minWidth:960,minHeight:700,title:`SpellTable Plus${testing?' — Player '+i:''}`,backgroundColor:'#23262b',webPreferences:{partition,contextIsolation:true,nodeIntegration:false,sandbox:true,preload:path.join(root,'desktop/preload.cjs'),backgroundThrottling:false}});
 win.removeMenu();win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith('http://127.0.0.1:47831/'))event.preventDefault();});
 const query=new URLSearchParams();if(testing){query.set('test','1');query.set('player',i);}if(serverAddress)query.set('server',serverAddress);
 await win.loadURL(`http://127.0.0.1:47831/?${query}`);windows.push(win);
}
const evaluate=(i,code)=>windows[i].webContents.executeJavaScript(code);
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,label){for(let i=0;i<60;i++){const result=await fn();if(result)return result;await wait(500);}throw Error(`Timed out: ${label}`);}
if(testing){
 try{
  await until(()=>evaluate(0,'!!window.tableTest'),'app ready');
  if(matchVerify)await evaluate(0,"document.getElementById('room-title').value='BR3 no mox · Desktop test';document.getElementById('public-room').checked=true");
  await evaluate(0,'tableTest.join(true)');
  const code=await until(()=>evaluate(0,'tableTest.getState()?.room'),'room');
  for(let i=1;i<4;i++)await evaluate(i,matchVerify?"document.getElementById('include').value='BR3 no mox';tableTest.queue()":`tableTest.join(false,${JSON.stringify(code)})`);
  await until(async()=>{const all=await Promise.all(windows.map((_,i)=>evaluate(i,'tableTest.stats()')));return all.every(stats=>stats.filter(s=>s.kind==='video'&&s.frames>5).length===3&&stats.filter(s=>s.kind==='audio'&&s.packets>5).length===3)&&all;},'twelve incoming video/audio streams');
  if(verify){
   await evaluate(0,"tableTest.send({type:'counter',field:'life',delta:-1});tableTest.send({type:'chat',text:'Four-player verification'});tableTest.send({type:'loadout',commander:'Krenko, Mob Boss',deck:'Test deck',link:''})");
   await until(async()=>{const states=await Promise.all(windows.map((_,i)=>evaluate(i,'tableTest.getState()')));return states.every(s=>s.players[0].life===39&&s.players[0].commander==='Krenko, Mob Boss'&&s.chat.some(m=>m.text==='Four-player verification'));},'shared counters, commander and chat');
   await evaluate(3,'tableTest.disconnect()');await wait(2500);
   await until(async()=>{const stats=await evaluate(3,'tableTest.stats()');return stats.filter(s=>s.kind==='video'&&s.frames>5).length===3;},'reconnect video');
   const result={time:new Date().toISOString(),checks:['four isolated desktop profiles','12 inbound video streams decoded','12 inbound audio streams received','life, commander and chat synchronized','disconnect and video reconnect'],stats:await Promise.all(windows.map((_,i)=>evaluate(i,'tableTest.stats()')))};
   if(matchVerify){result.checks.push('three keyword-queued players joined via separate matchmaking process');result.matchmakingServer=serverAddress;}
   if(recognitionVerify){
    const matches=await evaluate(0,"(async()=>{let matches=[];for(const video of document.querySelectorAll('.seat video')){if(!video.videoWidth)continue;const c=document.createElement('canvas');c.width=video.videoWidth;c.height=video.videoHeight;c.getContext('2d').drawImage(video,0,0);const result=await cardRecognition.identify(c.toDataURL('image/jpeg',.95).split(',')[1]);matches.push(...result.matches);}return matches;})()");
    if(!matches.length)throw Error('No cards recognized in live desktop streams');result.recognized=matches;result.checks.push('cards recognized from live received desktop video');
    await evaluate(0,"document.getElementById('recognize').click()");await wait(2200);
   }
   await mkdir(evidenceRoot,{recursive:true});await writeFile(path.join(evidenceRoot,'verification.json'),JSON.stringify(result,null,2));await writeFile(path.join(evidenceRoot,'desktop.png'),(await windows[0].webContents.capturePage()).toPNG());console.log('DESKTOP VERIFICATION PASSED');app.quit();
  }
 }catch(error){console.error(error);if(verify)app.exit(1);}
}
app.on('window-all-closed',()=>app.quit());
if(lobbyCapture){await wait(800);await mkdir(evidenceRoot,{recursive:true});await writeFile(path.join(evidenceRoot,'lobby.png'),(await windows[0].webContents.capturePage()).toPNG());app.quit();}
}).catch(error=>{console.error(error);app.exit(1);});
