const $=id=>document.getElementById(id), params=new URLSearchParams(location.search);
const playerNumber=Number(params.get('player')||1), token=localStorage.token ||= crypto.randomUUID();
let ws,id,state,stream,videoSource,timer,audioContext,leaving=false,roomCode='',cards=[];
let iceServers=[],socketReady,recognitionOn=false,recognitionBusy=false,recognitionSeat=0,recognitionTimer;
const peers=new Map(),remote=new Map();
const status=text=>$('status').textContent=text;
const send=data=>{if(ws?.readyState===1)ws.send(JSON.stringify(data));};
const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
function render(){
 if(!state)return;
 $('lobby').hidden=true;$('table').hidden=false;$('room-label').textContent=`Room ${state.room} · ${state.players.length}/4`;
 $('lock').hidden=state.host!==id;$('lock').textContent=state.locked?'Unlock table':'Lock table';
 const present=new Set(state.players.map(p=>p.id));
 for(const [key,pc] of peers)if(!present.has(key)||!state.players.find(p=>p.id===key).online){pc.close();peers.delete(key);remote.delete(key);}
 for(const old of [...$('seats').children])if(!present.has(old.dataset.id))old.remove();
 for(const p of state.players){
  let seat=$('seats').querySelector(`[data-id="${p.id}"]`);
  if(!seat){seat=el('article');seat.className='seat';seat.dataset.id=p.id;const video=el('video');video.autoplay=true;video.playsInline=true;video.muted=p.id===id||params.has('test');seat.append(video,el('div'));seat.lastChild.className='info';$('seats').append(seat);}
  const video=seat.firstChild,media=p.id===id?stream:remote.get(p.id);if(video.srcObject!==media)video.srcObject=media||null;
  const info=seat.lastChild;info.replaceChildren();const who=el('div',`${p.name}${p.id===id?' (you)':''}${p.online?'':' · reconnecting'}`);who.className='identity';who.append(el('small',p.commander||'Choose a commander'));info.append(who);
  if(state.host===id&&p.id!==id){const kick=el('button','Remove');kick.onclick=()=>send({type:'kick',id:p.id});info.append(kick);}
  for(const field of ['life','poison']){if(field==='poison')info.append(el('small','Poison'));for(const delta of [-1,0,1]){const c=el(delta?'button':'b',delta?(delta===1?'+':'−'):String(p[field]));if(delta){c.disabled=p.id!==id;c.setAttribute('aria-label',`${field} ${delta===1?'increase':'decrease'}`);c.onclick=()=>send({type:'counter',field,delta});}info.append(c);}}
  if(p.id!==id&&p.online&&stream&&!peers.has(p.id)&&id<p.id)connectPeer(p.id,true).catch(error=>status(error.message));
 }
 while($('seats').children.length<4){const empty=el('article','Waiting for a player');empty.className='seat empty';$('seats').append(empty);}
 $('messages').replaceChildren(...state.chat.map(m=>{const p=el('p');p.append(el('strong',m.name+': '),document.createTextNode(m.text));return p;}));$('messages').scrollTop=$('messages').scrollHeight;
}
async function connectPeer(other,offer){
 if(peers.has(other))return peers.get(other);
 const pc=new RTCPeerConnection({iceServers});peers.set(other,pc);
 if(stream)for(const track of stream.getTracks())pc.addTrack(track,stream);
 pc.onicecandidate=e=>{if(e.candidate)send({type:'signal',to:other,data:{candidate:e.candidate}});};
 pc.ontrack=e=>{remote.set(other,e.streams[0]);render();};
 pc.onconnectionstatechange=()=>{status(`${[...peers.values()].filter(p=>p.connectionState==='connected').length} peer connections`);if(pc.connectionState==='failed'){pc.close();peers.delete(other);send({type:'signal',to:other,data:{reset:true}});if(stream&&id<other)connectPeer(other,true).catch(e=>status(e.message));}};
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
function endpoint(){const value=$('server-address').value.trim();const url=new URL(value||`ws://${location.host}`);if(url.protocol!=='wss:'&&!(url.protocol==='ws:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)))throw Error('Use wss:// for an online server or ws://127.0.0.1 for local testing.');if(url.username||url.password)throw Error('Do not put credentials in the server address.');localStorage.serverAddress=value;return url.href;}
async function connectSocket(){
 const url=endpoint();if(ws?.readyState===1&&ws.url===url)return;
 if(ws?.readyState===0)return socketReady;
 if(ws){ws.onclose=null;ws.close();}
 leaving=false;ws=new WebSocket(url);const current=ws;
 socketReady=new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=()=>reject(Error('Cannot reach matchmaking server.'));});
 ws.onmessage=async event=>{try{const m=JSON.parse(event.data);
  if(m.type==='joined'){id=m.id;$('cancel-queue').disabled=true;$('queue').disabled=false;const saved=JSON.parse(localStorage.loadout||'{}');send({type:'loadout',...saved});}
  if(m.type==='ice'){iceServers=m.iceServers;for(const pc of peers.values())pc.setConfiguration({iceServers});}
  if(m.type==='queue'){$('cancel-queue').disabled=!m.active;$('queue').disabled=m.active;$('queue-status').textContent=m.active?'Waiting for a matching seat…':'Matchmaking cancelled.';}
  if(m.type==='rooms')renderRooms(m.rooms);
  if(['kicked','expired','replaced','left'].includes(m.type)){leaving=true;state=null;roomCode='';for(const pc of peers.values())pc.close();peers.clear();remote.clear();$('table').hidden=true;$('lobby').hidden=false;$('lock').hidden=true;$('room-label').textContent='Private table';status({kicked:'The host removed you.',expired:'This table expired.',replaced:'Session opened in another window.',left:'Left table.'}[m.type]);}
  if(m.type==='state'){state=m;roomCode=m.room;render();}
  if(m.type==='signal'){if(m.data.reset){peers.get(m.from)?.close();peers.delete(m.from);if(stream&&id<m.from)await connectPeer(m.from,true);}else await signal(m);}
  if(m.type==='error')status(m.message);
 }catch(error){status(error.message);}};
 ws.onclose=()=>{if(!leaving&&current===ws){status('Connection lost. Reconnecting…');for(const pc of peers.values())pc.close();peers.clear();setTimeout(()=>{(roomCode?join(false,roomCode):connectSocket()).catch(e=>status(e.message));},1500);}};
 return socketReady;
}
async function join(create=false,code=$('code').value){await connectSocket();roomCode=code;send({type:'join',create,room:code,token,name:$('name').value,title:$('room-title').value,public:$('public-room').checked});}
function renderRooms(rooms){$('room-list').replaceChildren(...rooms.map(room=>{const row=el('div');row.className='room-row';row.append(el('strong',room.title),el('span',`${room.players}/4`));const button=el('button','Join');button.disabled=!room.open;button.onclick=()=>join(false,room.code).catch(e=>status(e.message));row.append(button);return row;}));if(!rooms.length)$('room-list').append(el('p','No public tables yet. Create one or wait in the queue.'));}
async function browse(){await connectSocket();send({type:'list'});}
async function queue(){await connectSocket();send({type:'queue',token,name:$('name').value,include:$('include').value,exclude:$('exclude').value});}
$('browse').onclick=()=>browse().catch(e=>status(e.message));$('queue').onclick=()=>queue().catch(e=>status(e.message));$('cancel-queue').onclick=()=>send({type:'queue-cancel'});$('lock').onclick=()=>send({type:'lock',locked:!state.locked});
$('server-address').value=params.has('server')?params.get('server'):(params.has('test')?'':localStorage.serverAddress||'');
function save(){const value=Object.fromEntries(['deck','commander','link'].map(key=>[key,$(key).value.trim()]));localStorage.loadout=JSON.stringify(value);send({type:'loadout',...value});status('Loadout saved');}
$('create').onclick=()=>join(true).catch(e=>status(e.message));$('join').onclick=()=>join().catch(e=>status(e.message));$('save').onclick=save;
$('copy').onclick=()=>{navigator.clipboard.writeText(roomCode).then(()=>status('Room code copied'));};
$('leave').onclick=()=>{send({type:'leave'});stopMedia();};
$('start').onclick=()=>stream?stopMedia():startMedia();$('mute').onclick=()=>{const tracks=stream?.getAudioTracks()||[];for(const t of tracks)t.enabled=!t.enabled;$('mute').textContent=tracks[0]?.enabled?'Mute':'Unmute';};
$('share').onclick=()=>{try{const url=new URL($('link').value);if(!['moxfield.com','www.moxfield.com'].includes(url.hostname)||url.protocol!=='https:'||!url.pathname.startsWith('/decks/'))throw Error();send({type:'chat',text:`${$('deck').value||'My deck'}: ${url.href}`});}catch{status('Enter a valid HTTPS Moxfield deck link.');}};
$('chat').onsubmit=e=>{e.preventDefault();send({type:'chat',text:$('message').value});$('message').value='';};
function search(){const query=$('search').value.toLowerCase();$('results').replaceChildren(...cards.filter(c=>c.name.toLowerCase().includes(query)).slice(0,15).map(c=>{const p=el('p');p.append(el('strong',c.name),el('small',c.type),el('span',c.text));return p;}));}
$('search').oninput=search;fetch('/cards.json').then(r=>r.ok?r.json():[]).then(async data=>{cards=data;search();if(window.cardRecognition&&!params.has('test')){try{const library=await cardRecognition.library();cards=[...new Map([...cards,...library.cards].map(card=>[card.name,card])).values()];search();}catch{}}});
for(const [key,value] of Object.entries(JSON.parse(localStorage.loadout||'{}')))if($(key))$(key).value=value;
const recognitionPanel=el('section');recognitionPanel.className='recognition';const recognitionButton=el('button','Start card recognition');recognitionButton.id='recognize';const recognitionResults=el('div');recognitionResults.id='recognized';recognitionResults.textContent='Local processing · installed card library';recognitionPanel.append(recognitionButton,recognitionResults);document.querySelector('aside').insertBefore(recognitionPanel,document.querySelector('.references'));
const libraryDetails=el('details'),librarySummary=el('summary','Add cards to recognition');libraryDetails.append(librarySummary);
const libraryInput=el('textarea');libraryInput.placeholder='Paste card names or a decklist, one card per line';libraryInput.setAttribute('aria-label','Card names to add');const libraryAdd=el('button','Download card references'),libraryStatus=el('p','Downloads public artwork from Scryfall. Your footage stays on this PC.');libraryDetails.append(libraryInput,libraryAdd,libraryStatus);document.querySelector('.lobby-browser').append(libraryDetails);
libraryAdd.onclick=async()=>{
 if(!window.cardRecognition){libraryStatus.textContent='Open the desktop app to manage recognition.';return;}
 const names=[...new Set(libraryInput.value.split('\n').map(line=>line.trim().replace(/^\d+x?\s+/,'').replace(/\s+\([A-Za-z0-9]+\)\s+\S+.*$/,'')).filter(Boolean))];
 if(!names.length||names.length>100){libraryStatus.textContent='Enter 1–100 unique card names.';return;}
 libraryAdd.disabled=true;recognitionOn=false;clearInterval(recognitionTimer);recognitionButton.textContent='Start card recognition';libraryStatus.textContent=`Adding ${names.length} cards and their artwork variants. This may take a few minutes…`;
 try{const result=await cardRecognition.addCards(names);cards=[...new Map([...cards,...result.cards].map(card=>[card.name,card])).values()];search();libraryStatus.textContent=`Added ${result.added} artwork references. ${result.referenceCount} installed.${result.errors.length?' Could not add: '+result.errors.map(e=>e.name).join(', '):''}`;}catch(error){libraryStatus.textContent=error.message;}finally{libraryAdd.disabled=false;}
};
async function recognizeFrame(){
 if(recognitionBusy||!recognitionOn||!state)return;
 const videos=[...document.querySelectorAll('.seat video')].filter(v=>v.videoWidth&&v.readyState>=2);if(!videos.length)return;
 const video=videos[recognitionSeat++%videos.length],canvas=el('canvas');const scale=Math.min(1,1280/video.videoWidth);canvas.width=video.videoWidth*scale;canvas.height=video.videoHeight*scale;canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);
 recognitionBusy=true;try{const result=await window.cardRecognition.identify(canvas.toDataURL('image/jpeg',.9).split(',')[1]);recognitionResults.replaceChildren();const names=result.matches.map(m=>m.name);const player=state.players.find(p=>p.id===video.parentElement.dataset.id);recognitionResults.append(el('small',`${player?.name||'Player'} · ${result.milliseconds} ms`));
  for(const match of result.matches){const button=el('button',match.name);button.onclick=()=>{$('search').value=match.name;search();};recognitionResults.append(button);}if(!names.length)recognitionResults.append(el('p','No confident match in this frame.'));
 }catch(error){recognitionOn=false;clearInterval(recognitionTimer);recognitionButton.textContent='Start card recognition';recognitionResults.textContent=error.message;}finally{recognitionBusy=false;}
}
recognitionButton.onclick=()=>{if(!window.cardRecognition){recognitionResults.textContent='Recognition requires the desktop app.';return;}recognitionOn=!recognitionOn;recognitionButton.textContent=recognitionOn?'Stop card recognition':'Start card recognition';clearInterval(recognitionTimer);if(recognitionOn){recognizeFrame();recognitionTimer=setInterval(recognizeFrame,1800);}};
// Development diagnostics inspect actual peer stats; no credentials or privileged APIs.
window.tableTest={join,queue,startMedia,send,getState:()=>state,getId:()=>id,disconnect:()=>ws.close(),stats:async()=>{const result=[];for(const [peer,pc] of peers){const stats=await pc.getStats();for(const s of stats.values())if(s.type==='inbound-rtp')result.push({peer,kind:s.kind,frames:s.framesDecoded||0,packets:s.packetsReceived||0});}return result;}};
setInterval(()=>{if(state)send({type:'ice-refresh'});},40*60*1000);
if(params.has('test')){$('name').value=`Player ${playerNumber}`;await startMedia();}
