import {SmartSelect,SelectOption} from './components/SmartSelect.jsx';
import React,{useEffect,useState} from 'react';
const KEY='todo-appearance-v1';
export const accents=[['blue','晴空','#5276d6'],['teal','松石','#087f80'],['violet','鸢尾','#8056c4'],['rose','蔷薇','#b84b76'],['slate','石墨','#536575']];
export function normalizeAppearance(value){return {accent:accents.some(a=>a[0]===value?.accent)?value.accent:'blue',density:['compact','regular','relaxed'].includes(value?.density)?value.density:'regular',font:['small','normal','large'].includes(value?.font)?value.font:'normal'}}
export function useAppearance(storage){
 const [value,setValue]=useState(()=>{try{return normalizeAppearance(JSON.parse(storage.getItem(KEY)||'{}'))}catch{return normalizeAppearance({})}});
 const [error,setError]=useState('');
 useEffect(()=>{const el=document.documentElement;el.dataset.accent=value.accent;el.dataset.density=value.density;el.dataset.font=value.font;try{storage.setItem(KEY,JSON.stringify(value));setError('')}catch{setError('外观设置未保存，仅当前会话生效')}},[value,storage]);
 return {value,change:patch=>setValue(v=>normalizeAppearance({...v,...patch})),reset:()=>setValue(normalizeAppearance({})),error};
}
export function AppearanceSettings({appearance}){const {value,change,reset,error}=appearance;
 return <section className="appearance-settings"><h3>工作台外观</h3><p className="muted small">以下设置仅保存在本机，按账号独立。</p><div className="appearance-label">强调色</div><div className="accent-options">{accents.map(([id,label,color])=><button type="button" key={id} aria-label={label+'主题色'} aria-pressed={value.accent===id} className={value.accent===id?'chosen':''} onClick={()=>change({accent:id})}><span style={{background:color}}/>{label}</button>)}</div><label className="field"><span>控件密度</span><SmartSelect aria-label="控件密度" value={value.density} onValueChange={value=>change({density:value})}><SelectOption value="compact">紧凑</SelectOption><SelectOption value="regular">标准</SelectOption><SelectOption value="relaxed">舒展</SelectOption></SmartSelect></label><label className="field"><span>文字大小</span><SmartSelect aria-label="文字大小" value={value.font} onValueChange={value=>change({font:value})}><SelectOption value="small">较小</SelectOption><SelectOption value="normal">标准</SelectOption><SelectOption value="large">较大</SelectOption></SmartSelect></label><button className="secondary" onClick={reset}>恢复默认外观</button>{error&&<p role="alert">{error}</p>}</section>
}
