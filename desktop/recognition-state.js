// Geometric scores are not probabilities. Weak hits require repeated observations.
export class RecognitionHistory {
 constructor({ttl=20000}={}){this.ttl=ttl;this.seats=new Map();}
 update(seat,matches,now=Date.now()){
  const entries=this.seats.get(seat)||new Map(),seen=new Set();
  for(const match of matches){
   if(seen.has(match.name))continue;seen.add(match.name);
   const previous=entries.get(match.name),consecutive=previous&&now-previous.lastSeen<12000?previous.consecutive+1:1;
   const strong=match.inliers>=12&&match.ratio>=.6;
   entries.set(match.name,{...match,consecutive,lastSeen:now,confirmed:strong||consecutive>=2||(previous?.confirmed===true&&now-previous.lastSeen<=this.ttl)});
  }
  for(const [name,entry] of entries){if(!seen.has(name))entry.consecutive=0;if(now-entry.lastSeen>this.ttl)entries.delete(name);}
  this.seats.set(seat,entries);return this.get(seat,now);
 }
 get(seat,now=Date.now()){return [...(this.seats.get(seat)?.values()||[])].filter(entry=>entry.confirmed&&now-entry.lastSeen<=this.ttl).sort((a,b)=>b.lastSeen-a.lastSeen||a.name.localeCompare(b.name)).map(entry=>({...entry,ageSeconds:Math.floor((now-entry.lastSeen)/1000)}));}
 retain(seats){const active=new Set(seats);for(const id of this.seats.keys())if(!active.has(id))this.seats.delete(id);}
 clear(){this.seats.clear();}
}
