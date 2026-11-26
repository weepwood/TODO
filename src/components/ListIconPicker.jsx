import React,{useState} from 'react';
import {ListIcon} from './ListIcon.jsx';
import {LIST_SYMBOLS,LIST_EMOJIS,validListIcon} from '../core/list-appearance.js';
const labels=['收集箱','清单','工作','家','阅读','游戏','收藏','爱心','日历','代码','咖啡','购物','音乐','旅行','运动','植物','目标','文件夹'];
export function ListIconPicker({value,onChange,color,listId}){
 const [tab,setTab]=useState(value?.startsWith('emoji:')?'emoji':'symbol'),[custom,setCustom]=useState(value?.startsWith('emoji:')?value.slice(6):''),[error,setError]=useState(false);
 const items=tab==='emoji'?LIST_EMOJIS.map(e=>['emoji:'+e,e]):LIST_SYMBOLS.map((s,i)=>['icon:'+s,labels[i]]);
 return <div className="list-icon-picker"><div className="list-icon-preview"><ListIcon list={{id:listId,icon:value,color}} size={23}/><button type="button" className="secondary compact" onClick={()=>{onChange('');setError(false)}}>恢复默认</button></div>
 <div className="list-icon-tabs" role="group" aria-label="图标类型">{[['symbol','线性图标'],['emoji','Emoji']].map(([v,n])=><button type="button" key={v} aria-pressed={tab===v} onClick={()=>setTab(v)}>{n}</button>)}</div>
 <div className="list-icon-grid" role="group" aria-label="清单图标">{items.map(([v,label])=><button type="button" key={v} title={label} aria-label={label} aria-pressed={value===v} onClick={()=>{onChange(v);setError(false);if(tab==='emoji')setCustom(v.slice(6))}}><ListIcon list={{icon:v,color}} size={20}/></button>)}</div>
 {tab==='emoji'&&<><div className="list-custom-emoji"><input aria-label="自定义 Emoji" placeholder="输入一个 Emoji" value={custom} onChange={e=>{setCustom(e.target.value);setError(false)}} maxLength={40}/><button type="button" className="secondary compact" onClick={()=>{const v='emoji:'+custom.trim();if(validListIcon(v)){onChange(v);setError(false)}else setError(true)}}>应用</button></div>{error&&<small role="alert">请输入单个有效 Emoji</small>}</>}
 </div>
}
