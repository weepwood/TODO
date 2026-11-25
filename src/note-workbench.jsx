import React,{useState,useEffect,lazy,Suspense} from 'react';
import MDEditor from '@uiw/react-md-editor/nohighlight';
import * as commands from '@uiw/react-md-editor/commands-cn';
import '@uiw/react-md-editor/markdown-editor.css';
import MarkdownPreview from './markdown-preview.jsx';
import {Modal} from './ui.jsx';
const VisualNotes=lazy(()=>import('./visual-notes.jsx'));
export default function NoteWorkbench({value,onApply,onClose,locked}){
 const [original]=useState(value),[draft,setDraft]=useState(value),[split,setSplit]=useState(true),[visual,setVisual]=useState(false),[visualInitial,setVisualInitial]=useState("");
 const [dark,setDark]=useState(()=>document.documentElement.dataset.theme==='dark'||document.documentElement.dataset.theme==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);
 useEffect(()=>{const query=matchMedia('(prefers-color-scheme: dark)'),update=()=>setDark(document.documentElement.dataset.theme==='dark'||document.documentElement.dataset.theme==='system'&&query.matches);const observer=new MutationObserver(update);observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});query.addEventListener('change',update);return()=>{observer.disconnect();query.removeEventListener('change',update)}},[]);
 const stale=value!==original,changed=draft!==original;
 function close(){if(!changed||confirm('放弃未应用的备注草稿？'))onClose()}
 return <Modal open onClose={close} title="备注编辑工作台"><div className="note-workbench" data-color-mode={dark?'dark':'light'}>
 <div className="note-workbench-top"><span>{draft.length} 字符 · {draft.split('\n').length} 行</span><div className="note-mode"><button className="secondary compact" aria-pressed={visual} onClick={()=>{if(!visual)setVisualInitial(draft);setVisual(v=>!v)}}>{visual?"返回源码":"可视化编辑"}</button>{!visual&&<button className="secondary compact" aria-pressed={split} onClick={()=>setSplit(v=>!v)}>{split?'仅编辑':'并排预览'}</button>}</div></div>
 {stale&&<p className="sync-error" role="alert">任务备注已在其他操作中变化。为防止覆盖，请复制当前草稿并重新打开编辑器。</p>}
 {visual?<Suspense fallback={<p className="muted">加载可视化编辑器…</p>}><VisualNotes initial={visualInitial} onChange={setDraft} locked={locked}/></Suspense>:<div className={'note-workbench-grid '+(split?'split':'')}>
 <MDEditor value={draft} onChange={v=>setDraft(v??'')} preview="edit" highlightEnable={false} defaultTabEnable visibleDragbar={false} height={360} readOnly={locked} commands={['bold','italic','strike','title','quote','code','codeBlock','unorderedListCommand','orderedListCommand','checkedListCommand','table','link'].map(k=>commands[k]).filter(Boolean)} extraCommands={[]} textareaProps={{'aria-label':'工作台备注源码',placeholder:'输入 Markdown…',readOnly:locked}}/>
 {split&&<div className="markdown-preview note-live-preview"><MarkdownPreview value={draft}/></div>}
 </div>}<p className="muted small">{visual?"直接编辑格式化内容，应用前仍保存为 Markdown；复杂内容请使用源码模式。":"源文与预览分离，保留原 Markdown，不加载远程图片或执行 HTML。"}</p>
 <div className="dialog-actions"><button className="secondary" onClick={close}>取消</button><button className="primary" disabled={locked||stale||!changed} onClick={()=>{onApply(draft);onClose()}}>应用备注</button></div>
 </div></Modal>
}
