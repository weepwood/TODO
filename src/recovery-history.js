const KEY='todo-recovery-history-v1';
const kinds=['export','restore-workspace','restore-attachments'];
export function readRecoveryHistory(storage){try{const rows=JSON.parse(storage.getItem(KEY)||'[]');return Array.isArray(rows)?rows.filter(r=>r&&kinds.includes(r.kind)&&typeof r.at==='string'&&Number.isFinite(Date.parse(r.at))).slice(0,30):[]}catch{return []}}
export function recordRecovery(storage,kind,counts={}){
 if(!kinds.includes(kind))return false;
 const row={kind,at:new Date().toISOString()};
 for(const key of ['tasks','lists','attachments','added','skipped'])if(Number.isSafeInteger(counts[key])&&counts[key]>=0)row[key]=counts[key];
 try{storage.setItem(KEY,JSON.stringify([row,...readRecoveryHistory(storage)].slice(0,30)));return true}catch{return false}
}
export function clearRecoveryHistory(storage){try{storage.removeItem(KEY);return true}catch{return false}}
