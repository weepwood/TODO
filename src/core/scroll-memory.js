export const SCROLL_MEMORY_KEY='todo-scroll-memory-v1';
export function readScrollMemory(storage){
 try{const raw=JSON.parse(storage?.getItem(SCROLL_MEMORY_KEY)||'{}');return Object.fromEntries(Object.entries(raw||{}).filter(([key,value])=>key.length<=1024&&Number.isFinite(value)&&value>=0).slice(-300).map(([key,value])=>[key,Math.min(10000000,Math.round(value))]))}catch{return {}}
}
export function rememberScroll(storage,key,value){
 if(!storage||typeof key!=='string'||key.length>1024||!Number.isFinite(value)||value<0)return false;
 try{const previous=readScrollMemory(storage);const entries=Object.entries(previous).filter(([k])=>k!==key);storage.setItem(SCROLL_MEMORY_KEY,JSON.stringify(Object.fromEntries([...entries,[key,Math.min(10000000,Math.round(value))]].slice(-300))));return true}catch{return false}
}
