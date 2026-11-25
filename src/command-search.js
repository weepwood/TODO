// Bounded subsequence matching; exact and contiguous matches always rank first.
export function rankCommands(entries,query,limit=60,recent=[]){
 const tokens=query.trim().normalize('NFKC').toLowerCase().split(/\s+/).filter(Boolean);
 const recency=new Map(recent.map((id,i)=>[id,i]));
 const subsequence=(text,token)=>{let at=0,gaps=0,last=-1;for(const c of token){const next=text.indexOf(c,at);if(next<0)return null;if(last>=0)gaps+=next-last-1;last=next;at=next+1}return gaps};
 return entries.map((entry,index)=>{
  const name=entry.name.normalize('NFKC').toLowerCase(),hay=(name+' '+(entry.keywords||'')).normalize('NFKC').toLowerCase();
  let score=0;for(const t of tokens){
   if(name===t)score+=100;else if(name.startsWith(t))score+=70;else if(name.includes(t))score+=50;else if(hay.includes(t))score+=30;
   else{const gap=subsequence(name,t);if(t.length<2||gap===null)return null;score+=Math.max(1,15-gap)}
  }
  return {entry,index,score,recency:recency.get(entry.id||entry.name)??Infinity}
 }).filter(Boolean).sort((a,b)=>b.score-a.score||a.recency-b.recency||a.index-b.index).slice(0,limit).map(x=>x.entry);
}
export function readRecentCommands(storage){try{const v=JSON.parse(storage?.getItem('todo-command-recent-v1')||'[]');return Array.isArray(v)?[...new Set(v.filter(x=>typeof x==='string'&&x.length<=256))].slice(0,12):[]}catch{return []}}
export function rememberCommand(storage,entry,recent){const id=entry.id||entry.name;const next=[id,...recent.filter(x=>x!==id)].slice(0,12);try{storage?.setItem('todo-command-recent-v1',JSON.stringify(next))}catch{}return next}
