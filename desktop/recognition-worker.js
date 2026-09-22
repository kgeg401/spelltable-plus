import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import path from 'node:path';
import {existsSync} from 'node:fs';
export class RecognitionWorker {
 constructor(root,resources){this.root=root;this.resources=resources;this.sequence=0;}
 async start(){
  if(this.ready)return this.ready;
  this.ready=new Promise((resolve,reject)=>{
   const exe=this.resources?path.join(this.resources,'recognition/recognizer.exe'):path.join(this.root,'.venv/Scripts/python.exe');
   const index=this.resources?path.join(this.resources,'recognition/index'):path.join(this.root,'.recognition/index');
   if(!existsSync(exe)||!existsSync(path.join(index,'features.npz'))){reject(Error('Card recognition library is not installed.'));return;}
   this.child=spawn(exe,[...(this.resources?[]:[path.join(this.root,'recognition/engine.py')]),'--index',index,'--worker'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
   const timer=setTimeout(()=>{this.child.kill();reject(Error('Recognition startup timed out.'));},20000);
   this.child.once('error',error=>{clearTimeout(timer);reject(error);});
   this.child.once('exit',()=>{clearTimeout(timer);this.pending?.reject(Error('Recognition service stopped.'));this.pending=null;this.ready=null;reject(Error('Recognition service stopped.'));});
   createInterface({input:this.child.stdout}).on('line',line=>{try{const m=JSON.parse(line);if(m.ready){clearTimeout(timer);resolve(m);return;}if(this.pending){const {resolve,reject,timer}=this.pending;this.pending=null;clearTimeout(timer);m.error?reject(Error(m.error)):resolve(m);}}catch{}});
   this.child.stderr.on('data',()=>{});
  });
  try{return await this.ready;}catch(error){this.ready=null;throw error;}
 }
 async recognize(image){
  if(typeof image!=='string'||image.length>5_500_000||!/^[A-Za-z0-9+/=]+$/.test(image))throw Error('Invalid recognition frame.');
  await this.start();if(this.pending)throw Error('Recognition busy.');
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending=null;this.child.kill();reject(Error('Recognition timed out.'));},15000);this.pending={resolve,reject,timer};this.child.stdin.write(JSON.stringify({requestId:++this.sequence,image})+'\n');});
 }
 close(){this.child?.kill();}
}
