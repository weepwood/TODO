import {useState,useEffect,useRef,useCallback} from 'react';
const KEY='todo-calendar-feeds-v1';
export function validateFeedUrl(value){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password)throw Error('仅支持无嵌入认证信息的 HTTPS 链接');return u.href}
export function readFeeds(storage){try{const raw=JSON.parse(storage.getItem(KEY)||'[]');return Array.isArray(raw)?raw.filter(f=>f&&typeof f.name==='string'&&typeof f.url==='string').slice(0,20):[]}catch{return []}}
export async function fetchFeed(url,signal){
 const response=await fetch(validateFeedUrl(url),{credentials:'omit',referrerPolicy:'no-referrer',signal:signal||AbortSignal.timeout(12000)});
 if(!response.ok)throw Error('HTTP '+response.status);
 if(!response.body)throw Error('日历响应为空');
 const reader=response.body.getReader();let size=0;const chunks=[];
 try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>1000000)throw Error('日历超过 1 MB');chunks.push(value)}}finally{await reader.cancel().catch(()=>{})}
 return new Blob(chunks).text();
}
export function useCalendarFeeds(storage,update,blocked){
 const [feeds,setFeeds]=useState(()=>readFeeds(storage)),[status,setStatus]=useState({});
 const active=useRef(true),running=useRef(new Map()),current=useRef(feeds),blockedRef=useRef(blocked);current.current=feeds;blockedRef.current=blocked;
 const write=next=>{storage.setItem(KEY,JSON.stringify(next));current.current=next;setFeeds(next)};
 const refresh=useCallback(async(feed,adhoc=false)=>{
  if(blockedRef.current)throw Error('本地数据异常，暂不能更新订阅');
  if(running.current.has(feed.name))return;
  const controller=new AbortController();running.current.set(feed.name,controller);
  const timer=setTimeout(()=>controller.abort(),12000);
  setStatus(s=>({...s,[feed.name]:{...s[feed.name],loading:true,error:''}}));
  try{const {parseCalendar}=await import('./ical-import.js');const text=await fetchFeed(feed.url,controller.signal);const items=parseCalendar(text,feed.name);
   if(!active.current||controller.signal.aborted||blockedRef.current||(!adhoc&&!current.current.some(f=>f.name===feed.name&&f.url===feed.url)))return;
   update(d=>{const existing=(d.calendarEvents||[]).filter(e=>e.source===feed.name);if(JSON.stringify(existing)===JSON.stringify(items))return d;return {...d,calendarEvents:[...(d.calendarEvents||[]).filter(e=>e.source!==feed.name),...items]}});
   setStatus(s=>({...s,[feed.name]:{loading:false,last:Date.now(),count:items.length,error:''}}));
  }catch(e){if(active.current&&!controller.signal.aborted)setStatus(s=>({...s,[feed.name]:{...s[feed.name],loading:false,error:'日历更新失败，请检查网络或跨域限制'}}));throw Error('日历更新失败，请检查网络或跨域限制')}
  finally{clearTimeout(timer);if(running.current.get(feed.name)===controller)running.current.delete(feed.name);if(active.current)setStatus(s=>({...s,[feed.name]:{...s[feed.name],loading:false}}))}
 },[update]);
 useEffect(()=>{active.current=true;return()=>{active.current=false;for(const c of running.current.values())c.abort();running.current.clear()}},[]);
 useEffect(()=>{if(blocked)return;const all=()=>{if(navigator.onLine)for(const f of current.current)refresh(f).catch(()=>{})};const first=setTimeout(all,1500),interval=setInterval(all,3600000);window.addEventListener('online',all);return()=>{clearTimeout(first);clearInterval(interval);window.removeEventListener('online',all)}},[blocked,refresh]);
 function add(name,url){name=name.trim();if(!name||name.length>100)throw Error('请输入 1–100 字的日历名称');const next={name,url:validateFeedUrl(url)};if(feeds.length>=20&&!feeds.some(f=>f.name===name))throw Error('最多 20 个订阅');const previous=running.current.get(name);if(previous){previous.abort();running.current.delete(name)}write([...feeds.filter(f=>f.name!==name),next]);return refresh(next,true)}
 function remove(name){write(feeds.filter(f=>f.name!==name));const c=running.current.get(name);if(c){c.abort();running.current.delete(name)}}
 return {feeds,status,add,remove,refresh};
}
