import {FieldMessage} from '../design-system/FieldFeedback.jsx';
import React,{useState,useId} from 'react';
import {SHORTCUTS,chord,validBinding,defaults,displayShortcut} from '../core/shortcuts.js';
export function ShortcutSettings({bindings,onChange}){
 const errorId=useId();const [recording,setRecording]=useState(null),[error,setError]=useState('');
 const change=(id,value)=>{
  const issue=validBinding(id,value,bindings);if(issue){setError(issue);return}
  if(onChange({...bindings,[id]:value})){setRecording(null);setError('')}else setError('无法保存快捷键配置');
 };
 return <div className="shortcut-settings"><h3>快捷键</h3><p className="muted small">点击快捷键后按下新组合。Ctrl 与 Command 在不同平台等效；任务快捷键仅在任务行获得焦点时生效。</p>
 {['global','task'].map(scope=><section key={scope} className="shortcut-group"><h4>{scope==='global'?'应用内全局操作':'任务列表操作'}</h4>{SHORTCUTS.filter(x=>x[3]===scope).map(([id,label,defaultKey])=><div className="shortcut-row" key={id}><span>{label}</span><button type="button" className="shortcut-record secondary" aria-label={'编辑快捷键 '+label} aria-invalid={recording===id&&!!error||undefined} aria-describedby={recording===id&&error?errorId:undefined} data-shortcut-recording={recording===id||undefined} onClick={()=>{setRecording(id);setError('')}} onBlur={()=>{if(recording===id){setRecording(null);setError('')}}} onKeyDown={e=>{if(recording!==id)return;if(e.key==='Tab'){setRecording(null);return}e.preventDefault();e.stopPropagation();if(e.key==='Escape'){setRecording(null);setError('');return}const key=chord(e);if(key)change(id,key)}}>{recording===id?'请按快捷键…':displayShortcut(bindings[id])}</button><button type="button" className="text-link" aria-label={'清除快捷键 '+label} disabled={!bindings[id]} onClick={()=>change(id,'')}>清除</button></div>)}</section>)}
 <FieldMessage id={errorId} error={error}/>
 <button type="button" className="secondary" onClick={()=>{if(onChange(defaults())){setRecording(null);setError('')}else setError('无法保存快捷键配置')}}>恢复默认快捷键</button>
 <p className="muted small">Esc、Tab、输入框原生编辑及桌面系统级全局快捷键不在此处修改。</p></div>
}
