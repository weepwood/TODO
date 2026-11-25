export const SHORTCUT_KEY='todo-shortcuts-v1';
export const SHORTCUTS=[
 ['command','命令面板','Mod+K','global'],['capture','快速新建任务','Mod+N','global'],['search','全局搜索','Mod+F','global'],['undo','撤销','Mod+Z','global'],['redo','重做','Mod+Shift+Z','global'],
 ['rename','编辑任务标题','F2','task'],['today','安排今天','T','task'],['tomorrow','安排明天','M','task'],['previous','上一项任务','ArrowUp','task'],['next','下一项任务','ArrowDown','task'],['first','首项任务','Home','task'],['last','末项任务','End','task']
];
export const defaults=()=>Object.fromEntries(SHORTCUTS.map(([id,,key])=>[id,key]));
export function chord(e){
 if(e.isComposing||e.key==='Dead'||!e.key||['Control','Meta','Alt','Shift','Escape','Tab','Enter','Backspace','Delete',' '].includes(e.key))return '';
 const key=e.key.length===1?e.key.toUpperCase():e.key;
 if(!/^(?:[A-Z0-9]|F(?:[1-9]|1[0-2])|Arrow(?:Up|Down|Left|Right)|Home|End|PageUp|PageDown)$/.test(key))return '';
 return [e.ctrlKey||e.metaKey?'Mod':'',e.altKey?'Alt':'',e.shiftKey?'Shift':'',key].filter(Boolean).join('+');
}
export function validBinding(id,key,bindings){
 const def=SHORTCUTS.find(x=>x[0]===id);
 if(!def||typeof key!=='string')return '无效快捷键';
 if(!key)return '';
 if(!/^(?:Mod\+)?(?:Alt\+)?(?:Shift\+)?(?:[A-Z0-9]|F(?:[1-9]|1[0-2])|Arrow(?:Up|Down|Left|Right)|Home|End|PageUp|PageDown)$/.test(key))return '不支持此组合';
 if(def[3]==='global'&&!key.startsWith('Mod+'))return '全局快捷键需包含 Ctrl 或 Command';
 if(/^Mod\+(?:[ACVWXQRS]|Shift\+[TW])$/.test(key)||key==='F5'||key==='F11'||key==='F12')return '此组合保留给系统或浏览器';
 const other=SHORTCUTS.find(([otherId])=>otherId!==id&&bindings[otherId]===key);
 return other?'与「'+other[1]+'」冲突':'';
}
export function loadShortcuts(storage){
 const result=defaults();try{
  const saved=JSON.parse(storage.getItem(SHORTCUT_KEY)||'{}');
  // Validate the complete set, so swapped defaults and disabled actions survive reload.
  const candidate={...result};for(const [id] of SHORTCUTS)if(typeof saved?.[id]==='string')candidate[id]=saved[id];
  if(SHORTCUTS.every(([id])=>!validBinding(id,candidate[id],candidate)))return candidate;
 }catch{}
 return result;
}
export function shortcutAction(event,bindings,scope){
 const key=chord(event);if(!key)return undefined;
 return SHORTCUTS.find(([id,,,kind])=>kind===scope&&bindings[id]===key)?.[0];
}
export function displayShortcut(value){return value?value.replace('Mod','Ctrl / ⌘').replace('ArrowUp','↑').replace('ArrowDown','↓').replace('ArrowLeft','←').replace('ArrowRight','→'):'未设置'}
