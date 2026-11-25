// Device-local display preferences, not task data or activity events.
export const DETAIL_DENSITY_KEY='todo-detail-density-v1';
export const DETAIL_ORDER_KEY='todo-detail-order-v1';
export const DETAIL_SECTION_IDS=['plan','organization','notes','checklist','children','relations','resources','activity'];
export const DENSITY_MODES=['full','title'];
export function normalizeDetailDensity(value){
 // Old summary preference becomes folded rather than silently expanding.
 return Object.fromEntries(DETAIL_SECTION_IDS.filter(id=>['summary','title'].includes(value?.[id])).map(id=>[id,'title']));
}
export function readDetailDensity(storage){
 try{return normalizeDetailDensity(JSON.parse(storage.getItem(DETAIL_DENSITY_KEY)||'{}'))}catch{return {}}
}
export function nextDetailDensity(mode){return mode==='full'?'title':'full'}
export function setDetailDensity(state,id,mode){
 if(!DETAIL_SECTION_IDS.includes(id)||!DENSITY_MODES.includes(mode))return state;
 return normalizeDetailDensity({...state,[id]:mode});
}
export function normalizeDetailOrder(value){
 const known=Array.isArray(value)?[...new Set(value.filter(id=>DETAIL_SECTION_IDS.includes(id)))]:[];
 return [...known,...DETAIL_SECTION_IDS.filter(id=>!known.includes(id))];
}
export function readDetailOrder(storage){
 try{return normalizeDetailOrder(JSON.parse(storage.getItem(DETAIL_ORDER_KEY)||'null'))}catch{return [...DETAIL_SECTION_IDS]}
}
export function moveDetailSection(order,active,over){
 const from=order.indexOf(active),to=order.indexOf(over);
 if(from<0||to<0||from===to)return order;
 const next=order.slice();next.splice(to,0,next.splice(from,1)[0]);return next;
}
