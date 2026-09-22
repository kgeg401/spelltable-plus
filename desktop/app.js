const $=id=>document.getElementById(id), params=new URLSearchParams(location.search);
const playerNumber=Number(params.get('player')||1), token=localStorage.token ||= crypto.randomUUID();
let ws,id,state,stream,videoSource,timer,audioContext,leaving=false,roomCode='',cards=[];
const peers=new Map(),remote=new Map();
const status=text=>$('status').textContent=text;
const send=data=>{if(ws?.readyState===1)ws.send(JSON.stringify(data));};
const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
function render(){
 if(!state)return;
 $('lobby').hidden=true;$('table').hidden=false;$('room-label').textContent=`Room ${state.room} · ${state.players.length}/4`;
 const present=new Set(state.players.map(p=>p.id));
 for(const [key,pc] of peers)if(!present.has(key)||!state.players.find(p=>p.id===key).online){pc.close();peers.delete(key);remote.delete(key);}
 for(const old of [...$('seats').children])if(!present.has(old.dataset.id))old.remove();
 for(const p of state.players){
  let seat=$('seats').querySelector(`[data-id="${p.id}"]`);
  if(!seat){seat=el('article');seat.className='seat';seat.dataset.id=p.id;const video=el('video');video.autoplay=true;video.playsInline=true;video.muted=p.id===id||params.has('test');seat.append(video,el('div'));seat.lastChild.className='info';$('seats').append(seat);}
  const video=seat.firstChild,media=p.id===id?stream:remote.get(p.id);if(video.srcObject!==media)video.srcObject=media||null;
  const info=seat.lastChild;info.replaceChildren();const who=el('div',`${p.name}${p.id===id?' (you)':''}${p.online?'':' · reconnecting'}`);who.className='identity';who.append(el('small',p.commander||'Choose a commander'));info.append(who);
  for(const field of ['life','poison']){if(field==='poison')info.append(el('small','Poison'));for(const delta of [-1,0,1]){const c=el(delta?'button':'b',delta?(delta===1?'+':'−'):String(p[field]));if(delta){c.disabled=p.id!==id;c.setAttribute('aria-label',`${field} ${delta===1?'increase':'decrease'}`);c.onclick=()=>send({type:'counter',field,delta});}info.append(c);}}
  if(p.id!==id&&p.online&&stream&&!peers.has(p.id)&&id<p.id)connectPeer(p.id,true).catch(error=>status(error.message));
 }
 while($('seats').children.length<4){const empty=el('article','Waiting for a player');empty.className='seat empty';$('seats').append(empty);}
 $('messages').replaceChildren(...state.chat.map(m=>{const p=el('p');p.append(el('strong',m.name+': '),document.createTextNode(m.text));return p;}));$('messages').scrollTop=$('messages').scrollHeight;
}
async function connectPeer(other,offer){
 if(peers.has(other))return peers.get(other);
 const pc=new RTCPeerConnection({iceServers:[]});peers.set(other,pc);
 if(stream)for(const track of stream.getTracks())pc.addTrack(track,stream);
 pc.onicecandidate=e=>{if(e.candidate)send({type:'signal',to:other,data:{candidate:e.candidate}});};
 pc.ontrack=e=>{remote.set(other,e.streams[0]);render();};
 pc.onconnectionstatechange=()=>status(`${[...peers.values()].filter(p=>p.connectionState==='connected').length} peer connections · local test`);
 if(offer){await pc.setLocalDescription(await pc.createOffer());send({type:'signal',to:other,data:{description:pc.localDescription}});}
 return pc;
}
async function signal(m){
 const pc=await connectPeer(m.from,false);
 if(m.data.description){await pc.setRemoteDescription(m.data.description);for(const candidate of pc.pendingCandidates||[])await pc.addIceCandidate(candidate);pc.pendingCandidates=[];
  if(m.data.description.type==='offer'){await pc.setLocalDescription(await pc.createAnswer());send({type:'signal',to:m.from,data:{description:pc.localDescription}});}}
 if(m.data.candidate){if(pc.remoteDescription)await pc.addIceCandidate(m.data.candidate);else(pc.pendingCandidates ||= []).push(m.data.candidate);}
}
async function startMedia(){
 if(stream)return;
 try{
  if($('source').value==='camera')stream=await navigator.mediaDevices.getUserMedia({video:true,audio:true});
  else {
   videoSource=el('video');videoSource.src=`/media/player-${playerNumber}.mp4`;videoSource.loop=true;videoSource.muted=true;await videoSource.play();
   const canvas=el('canvas');canvas.width=640;canvas.height=360;const ctx=canvas.getContext('2d');timer=setInterval(()=>ctx.drawImage(videoSource,0,0,640,360),66);stream=canvas.captureStream(15);
   audioContext=new AudioContext();await audioContext.resume();const tone=audioContext.createOscillator(),gain=audioContext.createGain(),dest=audioContext.createMediaStreamDestination();tone.frequency.value=220+playerNumber*110;gain.gain.value=.015;tone.connect(gain).connect(dest);tone.start();stream.addTrack(dest.stream.getAudioTracks()[0]);
  }
  $('start').textContent='Stop camera';$('source').disabled=true;
  for(const pc of peers.values())pc.close();peers.clear();render();
  // Ask existing peers to rebuild when media starts after joining.
  for(const p of state?.players||[])if(p.id!==id)send({type:'signal',to:p.id,data:{reset:true}});
 }catch(error){status(`Media unavailable: ${error.message}`);}
}
function stopMedia(){for(const track of stream?.getTracks()||[])track.stop();stream=null;clearInterval(timer);videoSource?.pause();audioContext?.close();for(const pc of peers.values())pc.close();peers.clear();remote.clear();$('start').textContent='Start camera';$('source').disabled=false;render();}
function join(create=false,code=$('code').value){
 leaving=false;roomCode=code;ws=new WebSocket(`ws://${location.host}`);
 ws.onopen=()=>send({type:'join',create,room:roomCode,token,name:$('name').value});
 ws.onmessage=async event=>{try{const m=JSON.parse(event.data);
  if(m.type==='joined'){id=m.id;const saved=JSON.parse(localStorage.loadout||'{}');send({type:'loadout',...saved});}
  if(m.type==='state'){state=m;roomCode=m.room;render();}
  if(m.type==='signal'){if(m.data.reset){peers.get(m.from)?.close();peers.delete(m.from);if(stream&&id<m.from)await connectPeer(m.from,true);}else await signal(m);}
  if(m.type==='error')status(m.message);
 }catch(error){status(error.message);}};
 ws.onclose=()=>{if(!leaving){status('Connection lost. Reconnecting…');for(const pc of peers.values())pc.close();peers.clear();setTimeout(()=>join(false,roomCode),1500);}};
}
function save(){const value=Object.fromEntries(['deck','commander','link'].map(key=>[key,$(key).value.trim()]));localStorage.loadout=JSON.stringify(value);send({type:'loadout',...value});status('Loadout saved');}
$('create').onclick=()=>join(true);$('join').onclick=()=>join();$('save').onclick=save;
$('copy').onclick=()=>{navigator.clipboard.writeText(roomCode).then(()=>status('Room code copied'));};
$('leave').onclick=()=>{leaving=true;send({type:'leave'});stopMedia();location.href='/';};
$('start').onclick=()=>stream?stopMedia():startMedia();$('mute').onclick=()=>{const tracks=stream?.getAudioTracks()||[];for(const t of tracks)t.enabled=!t.enabled;$('mute').textContent=tracks[0]?.enabled?'Mute':'Unmute';};
$('share').onclick=()=>{try{const url=new URL($('link').value);if(!['moxfield.com','www.moxfield.com'].includes(url.hostname)||url.protocol!=='https:'||!url.pathname.startsWith('/decks/'))throw Error();send({type:'chat',text:`${$('deck').value||'My deck'}: ${url.href}`});}catch{status('Enter a valid HTTPS Moxfield deck link.');}};
$('chat').onsubmit=e=>{e.preventDefault();send({type:'chat',text:$('message').value});$('message').value='';};
function search(){const query=$('search').value.toLowerCase();$('results').replaceChildren(...cards.filter(c=>c.name.toLowerCase().includes(query)).slice(0,15).map(c=>{const p=el('p');p.append(el('strong',c.name),el('small',c.type),el('span',c.text));return p;}));}
$('search').oninput=search;fetch('/cards.json').then(r=>r.ok?r.json():[]).then(data=>{cards=data;search();});
for(const [key,value] of Object.entries(JSON.parse(localStorage.loadout||'{}')))if($(key))$(key).value=value;
// Development diagnostics inspect actual peer stats; no credentials or privileged APIs.
window.tableTest={join,startMedia,send,getState:()=>state,getId:()=>id,disconnect:()=>ws.close(),stats:async()=>{const result=[];for(const [peer,pc] of peers){const stats=await pc.getStats();for(const s of stats.values())if(s.type==='inbound-rtp')result.push({peer,kind:s.kind,frames:s.framesDecoded||0,packets:s.packetsReceived||0});}return result;}};
if(params.has('test')){$('name').value=`Player ${playerNumber}`;await startMedia();}
