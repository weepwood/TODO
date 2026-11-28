// Local presentation only; never mutate list/folder ownership or task ordering.
export function normalizeSidebarOrder(value){
 return Object.fromEntries(Object.entries(value&&typeof value==='object'&&!Array.isArray(value)?value:{}).filter(([key,ids])=>key.length<=512&&Array.isArray(ids)).slice(-300).map(([key,ids])=>[key,[...new Set(ids.filter(id=>typeof id==='string'&&id.length<=512))].slice(0,1000)]));
}
export function orderSidebarItems(items,order=[]){
 const byId=new Map(items.map(item=>[item.id,item]));
 return [...new Set([...order,...byId.keys()])].filter(id=>byId.has(id)).map(id=>byId.get(id));
}
export function moveSidebarItem(ids,from,to){
 const a=ids.indexOf(from),b=ids.indexOf(to);
 if(a<0||b<0||a===b)return ids;
 const next=ids.slice();next.splice(a,1);next.splice(b,0,from);return next;
}
