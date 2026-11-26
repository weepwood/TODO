import {useEffect,useState} from 'react';
const KEY='todo-appearance-v1';
export const accents=[['blue','晴空','#4667c2'],['teal','松石','#087f80'],['violet','鸢尾','#8056c4'],['rose','蔷薇','#b84b76'],['slate','石墨','#536575']];
export function normalizeAppearance(value){return {accent:accents.some(a=>a[0]===value?.accent)?value.accent:'blue',density:['compact','regular','relaxed'].includes(value?.density)?value.density:'regular',font:['small','normal','large'].includes(value?.font)?value.font:'normal',enhancedFocus:value?.enhancedFocus===true}}
export function useAppearance(storage){
 const [value,setValue]=useState(()=>{try{return normalizeAppearance(JSON.parse(storage.getItem(KEY)||'{}'))}catch{return normalizeAppearance({})}});
 const [error,setError]=useState('');
 useEffect(()=>{const el=document.documentElement;el.dataset.accent=value.accent;el.dataset.density=value.density;el.dataset.font=value.font;el.dataset.focusMode=value.enhancedFocus?'enhanced':'quiet';try{storage.setItem(KEY,JSON.stringify(value));setError('')}catch{setError('外观设置未保存，仅当前会话生效')}},[value,storage]);
 useEffect(()=>{const root=document.documentElement;root.dataset.inputModality='pointer';const pointer=()=>{root.dataset.inputModality='pointer'};const keyboard=e=>{if(e.key==='Tab'||(!e.target?.closest?.('input,textarea,[contenteditable=true]')&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End'].includes(e.key)))root.dataset.inputModality='keyboard'};window.addEventListener('pointerdown',pointer,true);window.addEventListener('keydown',keyboard,true);return()=>{window.removeEventListener('pointerdown',pointer,true);window.removeEventListener('keydown',keyboard,true);delete root.dataset.inputModality}},[]);
 return {value,change:patch=>setValue(v=>normalizeAppearance({...v,...patch})),reset:()=>setValue(normalizeAppearance({})),error};
}
