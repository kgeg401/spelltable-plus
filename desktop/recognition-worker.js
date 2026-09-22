import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import path from 'node:path';
import {existsSync} from 'node:fs';
import {mkdir,cp} from 'node:fs/promises';
export class RecognitionWorker {
 constructor(root,resources,userIndex){this.root=root;this.resources=resources;this.userIndex=userIndex;this.sequence=0;}
 start(){if(!this.ready)this.ready=this.boot().catch(error=>{this.ready=null;throw error;});return this.ready;}
 async boot(){
  const exe=this.resources?path.join(this.resources,'recognition/recognizer.exe'):path.join(this.root,'.venv/Scripts/python.exe');
  const source=this.resources?path.join(this.resources,'recognition/index'):path.join(this.root,'.recognition/index');
  const index=this.userIndex||source;
  if(!existsSync(exe)||!existsSync(path.join(source,'features.npz')))throw Error('Card recognition library is not installed.');
  if(index!==source&&!existsSync(path.join(index,'features.npz'))){await mkdir(index,{recursive:true});await cp(path.join(source,'features.npz'),path.join(index,'features.npz'));await cp(path.join(source,'cards.json'),path.join(index,'cards.json'));}
  return new Promise((resolve,reject)=>{
   this.child=spawn(exe,[...(this.resources?[]:[path.join(this.root,'recognition/engine.py')]),'--index',index,'--worker'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
   const timer=setTimeout(()=>{this.child.kill();reject(Error('Recognition startup timed out.'));},20000);
   this.child.once('error',error=>{clearTimeout(timer);reject(error);});
   this.child.once('exit',()=>{clearTimeout(timer);if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(Error('Recognition service stopped.'));}this.pending=null;this.ready=null;reject(Error('Recognition service stopped.'));});
   createInterface({input:this.child.stdout}).on('line',line=>{try{const m=JSON.parse(line);if(m.ready){clearTimeout(timer);resolve(m);return;}if(this.pending){const {resolve,reject,timer}=this.pending;this.pending=null;clearTimeout(timer);m.error?reject(Error(m.error)):resolve(m);}}catch{}});
   this.child.stderr.on('data',()=>{});
  });
 }
 async request(message,timeout=15000){
  await this.start();if(this.pending)throw Error('Recognition library is busy. Try again shortly.');
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending=null;this.child.kill();reject(Error('Recognition request timed out.'));},timeout);this.pending={resolve,reject,timer};this.child.stdin.write(JSON.stringify({requestId:++this.sequence,...message})+'\n');});
 }
 recognize(image){if(typeof image!=='string'||image.length>5_500_000||!/^[A-Za-z0-9+/=]+$/.test(image))throw Error('Invalid recognition frame.');return this.request({image});}
 addCards(names){if(!Array.isArray(names)||names.length<1||names.length>100||names.some(name=>typeof name!=='string'||!name.trim()||name.length>200))throw Error('Provide 1–100 card names.');return this.request({action:'add-cards',names},15*60*1000);}
 library(){return this.request({action:'library'});}
 close(){this.child?.kill();}
}
