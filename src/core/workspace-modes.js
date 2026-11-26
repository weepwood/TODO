import {SORTS,GROUPS,ORDERS} from './task-list-interaction.js';
import {VIEW_FIELDS} from './view-preferences.js';
export const MODE_KEY='todo-workspace-modes-v1';
export const MODE_MODULES=['tasks','calendar','board','matrix','planner','focus','habits','stats','workflow','goals','report'];
function valid(row){return row&&typeof row.name==='string'&&row.name.trim()&&row.name.length<=60&&MODE_MODULES.includes(row.module)&&typeof row.view==='string'&&row.view.length<=256&&typeof row.sidebarHidden==='boolean'&&typeof row.detailVisible==='boolean'&&Number.isInteger(row.sidebar)&&row.sidebar>=176&&row.sidebar<=340&&Number.isInteger(row.detail)&&row.detail>=280&&row.detail<=540&&validExtras(row)}
export function readModes(storage){const raw=storage.getItem(MODE_KEY);if(raw===null)return [];const rows=JSON.parse(raw);if(!Array.isArray(rows)||rows.length>30||!rows.every(valid)||new Set(rows.map(r=>r.name)).size!==rows.length)throw Error('工作模式存储异常，原记录保留');return rows}
export function saveMode(storage,name,snapshot){const row={...snapshot,name:name.trim()};if(!valid(row))throw Error('工作模式无效');const rows=readModes(storage);if(rows.some(r=>r.name===row.name)||rows.length>=30)throw Error('名称重复或已达到30个上限');const next=[...rows,row];storage.setItem(MODE_KEY,JSON.stringify(next));return next}
export function deleteMode(storage,name){const next=readModes(storage).filter(r=>r.name!==name);storage.setItem(MODE_KEY,JSON.stringify(next));return next}


// Backward-compatible optional preferences. Exports exclude task query text,
// account identifiers, credentials, and task contents.
function validExtras(r){
 const v=r.listLayout,a=r.appearance;
 return (v===undefined||v&&SORTS.some(x=>x[0]===v.sort)&&GROUPS.some(x=>x[0]===v.group)&&ORDERS.some(x=>x[0]===v.order)&&['inherit','show','hide'].includes(v.completed)&&Array.isArray(v.fields)&&v.fields.every(k=>VIEW_FIELDS.includes(k))&&new Set(v.fields).size===v.fields.length)
 &&(a===undefined||a&&['compact','regular','relaxed'].includes(a.density)&&['small','normal','large'].includes(a.font));
}
export function portableMode(r){
 if(!valid(r))throw Error('工作模式无效');
 const {name,module,view,sidebarHidden,detailVisible,sidebar,detail,listLayout,appearance}=r;
 // Do not export custom view IDs. On a different account they may not exist.
 const v=['today','upcoming','all','overdue','recurring','someday','completed','skipped','trash','inbox'].includes(view)?view:'today';
 return {name,module,view:v,sidebarHidden,detailVisible,sidebar,detail,...(listLayout?{listLayout:{sort:listLayout.sort,group:listLayout.group,order:listLayout.order,completed:listLayout.completed,fields:[...listLayout.fields]}}:{}),...(appearance?{appearance:{density:appearance.density,font:appearance.font}}:{})};
}
export function exportModes(rows){return JSON.stringify({format:'todo-workspace-modes',version:1,modes:rows.map(portableMode)},null,2)}
export function previewModeImport(storage,raw){
 if(typeof raw!=='string'||new TextEncoder().encode(raw).length>128*1024)throw Error('配置超过128 KiB');
 const parsed=JSON.parse(raw);if(parsed?.format!=='todo-workspace-modes'||parsed.version!==1||!Array.isArray(parsed.modes)||parsed.modes.length>30)throw Error('配置格式无效');
 const incoming=parsed.modes.map(portableMode),old=readModes(storage),names=new Set(old.map(r=>r.name));
 if(new Set(incoming.map(r=>r.name)).size!==incoming.length)throw Error('导入配置名称重复');
 const added=incoming.filter(r=>!names.has(r.name)),skipped=incoming.filter(r=>names.has(r.name)).map(r=>r.name);
 if(old.length+added.length>30)throw Error('合计超过30份模式');
 return {added,skipped,baseline:JSON.stringify(old)};
}
export function applyModeImport(storage,preview){const old=readModes(storage);if(JSON.stringify(old)!==preview.baseline)throw Error('当前配置已变化，请重新预览');const next=[...old,...preview.added];if(next.length>30||!next.every(valid)||new Set(next.map(r=>r.name)).size!==next.length)throw Error('配置无效');storage.setItem(MODE_KEY,JSON.stringify(next));return next}
