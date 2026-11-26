const EXCHANGE_LIMIT=1000;
export function validImportRuns(runs){
 return Array.isArray(runs)&&runs.length<=10&&new TextEncoder().encode(JSON.stringify(runs)).length<=2*1024*1024&&new Set(runs.map(r=>r?.id)).size===runs.length&&runs.every(r=>r&&typeof r.id==='string'&&r.id.length<=100&&Number.isFinite(Date.parse(r.at))&&(r.undone===undefined||r.undone===true)&&Array.isArray(r.entries)&&r.entries.length>0&&r.entries.length<=EXCHANGE_LIMIT&&new Set(r.entries.map(e=>e?.id)).size===r.entries.length&&r.entries.every(e=>e&&typeof e.id==='string'&&typeof e.signature==='string'));
}
