import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {invoke,isTauri} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {quickParse} from './advanced.js';
import {dayKey} from './domain.js';
import './capture.css';
function Capture(){
 const [draft,setDraft]=useState(''),[generation,setGeneration]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const field=useRef(null),native=isTauri();
 useEffect(()=>{if(!native)return;let alive=true,unlisten;const refresh=()=>invoke('native_capture_generation').then(g=>{if(alive){setGeneration(g);field.current?.focus()}}).catch(()=>{if(alive)setError('无法连接主窗口')});const reset=()=>{setDraft('');setError('');refresh()};listen('todo-capture-reset',reset).then(fn=>{if(alive){unlisten=fn;refresh()}else fn()}).catch(()=>{});window.addEventListener('focus',refresh);return()=>{alive=false;unlisten?.();window.removeEventListener('focus',refresh)}},[native]);
 async function cancel(){try{await invoke('native_capture_cancel');setDraft('');setError('')}catch(e){setError(String(e))}}
 async function submit(e){e.preventDefault();if(busy||generation===null||!draft.trim())return;setBusy(true);setError('');try{await invoke('native_capture_handoff',{generation,text:draft});setDraft('')}catch(e){setError(String(e))}finally{setBusy(false)}}
 const parsed=quickParse(draft,dayKey());
 return <main className="capture"><header><span className="mark">✓</span><div><h1>快速录入</h1><p>草稿将交由主窗口确认，不直接写入数据。</p></div></header>{!native?<p>独立录入仅适用于 TODO 桌面版。</p>:<form onSubmit={submit} onKeyDown={e=>{if(e.key==='Escape'&&!e.nativeEvent.isComposing){e.preventDefault();cancel()}}}><label htmlFor="capture-title">任务内容</label><input id="capture-title" ref={field} autoFocus maxLength={500} value={draft} placeholder="例如：阅读 明天 09:30 !2" onChange={e=>setDraft(e.target.value)}/><div className="preview"><strong>{parsed.title||'等待输入任务'}</strong><small>{[parsed.date,parsed.time,parsed.priority?['','低优先级','中优先级','高优先级'][parsed.priority]:''].filter(Boolean).join(' · ')||'未安排日期'}</small></div>{error&&<p role="alert">{error}</p>}<footer><button type="button" onClick={cancel}>取消</button><button type="submit" className="primary" disabled={busy||generation===null||!parsed.title}>在主窗口确认</button></footer></form>}</main>
}
createRoot(document.getElementById('capture-root')).render(<Capture/>);
