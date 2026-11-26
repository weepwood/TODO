import {useCallback,useEffect,useRef,useState} from 'react';
import {dayKey,reconcile,dueReminderEvents,markReminderEvents} from '../core/domain.js';
import {protectLockedTasks} from '../core/plan-block.js';
import {settleFocus,focusDue} from '../core/focus-engine.js';
import {native,nativeNotify} from '../native.js';
import {androidNative} from '../platform/runtime.js';
import {hasScheduledReminder} from '../platform/android/scheduled-reminders.js';
import {shortcutAction} from '../core/shortcuts.js';

// Long-lived listeners must not close over App's entire render environment.
export function useEditingFlag(){
 const ref=useRef(false);const track=useCallback(value=>{ref.current=value},[]);
 return [ref,track];
}
export function useCaptureHandlers(quickDraft,setQuickDraft,setDialog){
 const quickAdd=useCallback(()=>{setDialog('quick-add')},[]);
 const [incomingCapture,setIncomingCapture]=useState([]);const quickDraftRef=useRef(quickDraft);quickDraftRef.current=quickDraft;
 const receiveCapture=useCallback(text=>{if(text){if(quickDraftRef.current.trim()&&quickDraftRef.current!==text)setIncomingCapture(old=>old.includes(text)?old:[...old,text]);else{quickDraftRef.current=text;setQuickDraft(text)}}setDialog('quick-add')},[]);
 return {quickAdd,incomingCapture,setIncomingCapture,quickDraftRef,receiveCapture};
}
export function useWorkspaceClock(data,setSystemData,setToday,uid,setToast){
 const committedData=useRef(data);useEffect(()=>{committedData.current=data},[data]);
 useWorkspaceTick(committedData,setSystemData,setToday);
 useWorkspaceNotices(data.notifications,uid,setToast);
}
function useWorkspaceTick(committedData,setSystemData,setToday){
 useEffect(()=>{let lastTasks=null,lastMinute=null;const tick=()=>{const date=new Date(),at=date.getTime(),minute=Math.floor(at/60000),sweep=committedData.current.tasks!==lastTasks||minute!==lastMinute;lastTasks=committedData.current.tasks;lastMinute=minute;if(sweep)setToday(dayKey(date));if(!sweep&&!focusDue(committedData.current.timer,at))return;setSystemData(d=>{
  if(!sweep)return settleFocus(d,date.getTime());
  let tasks=protectLockedTasks(d,{...d,tasks:reconcile(d.tasks,dayKey(date),date)}).tasks;const due=dueReminderEvents(tasks,date);let notifications=d.notifications;
  if(due.length){tasks=markReminderEvents(tasks,due,date.toISOString());const existing=new Set(notifications.map(n=>n.id));notifications=[...notifications,...due.map(t=>({id:'reminder:'+JSON.stringify([t.taskId,t.id,t.at]),title:t.title,taskId:t.taskId,reminderAt:t.at,at:date.toISOString()})).filter(n=>!existing.has(n.id))].slice(-100)}
  const next=tasks===d.tasks&&notifications===d.notifications?d:{...d,tasks,notifications};return settleFocus(next,date.getTime())},'system')};
 const handle=setInterval(tick,1000),wake=()=>{lastMinute=null;tick()};window.addEventListener('focus',wake);document.addEventListener('visibilitychange',wake);tick();return()=>{clearInterval(handle);window.removeEventListener('focus',wake);document.removeEventListener('visibilitychange',wake)}},[]);
}
function useWorkspaceNotices(notifications,uid,setToast){
 const lastNotice=useRef(new Set(notifications.map(n=>n.id))),nativeQueue=useRef(new Map()),noticeAlive=useRef(true);
 const deliverNative=useCallback(async(n)=>{
  const queue=nativeQueue.current,entry=queue.get(n.id);if(!entry||entry.running)return;entry.running=true;entry.attempts++;
  try{if(androidNative&&hasScheduledReminder(uid||"guest",n.taskId||n.id,n.reminderAt||n.at)){queue.delete(n.id);return}await nativeNotify(uid,{taskId:n.taskId||n.id,at:n.reminderAt||n.at,title:n.title});queue.delete(n.id)}
  catch{entry.running=false;if(entry.attempts>=3){queue.delete(n.id);if(noticeAlive.current)setToast('系统提醒未能发送，请检查通知权限。提醒仍保留在应用内。')}}
 },[uid]);
 useEffect(()=>{noticeAlive.current=true;if(!native)return;const handle=setInterval(()=>{for(const entry of nativeQueue.current.values())deliverNative(entry.notice)},30000);return()=>{noticeAlive.current=false;clearInterval(handle);nativeQueue.current.clear()}},[deliverNative]);
 useEffect(()=>{const recent=notifications.filter(n=>!lastNotice.current.has(n.id));lastNotice.current=new Set(notifications.map(n=>n.id));for(const n of recent){setToast('提醒：'+n.title);if(native){const queue=nativeQueue.current;if(queue.size>=100)queue.delete(queue.keys().next().value);queue.set(n.id,{notice:n,attempts:0,running:false});deliverNative(n)}else if(typeof Notification!=='undefined'&&Notification.permission==='granted')try{new Notification('TODO',{body:n.title})}catch{setToast('系统提醒发送失败，请检查浏览器通知权限。')}}},[notifications,deliverNative]);
}
export function useWorkspaceKeyboard({shortcuts,dialog,quickAdd,undo,redo,setQuery,setChecked,setSelectionMode,selectionAnchor,setDialog}){
 useEffect(()=>{const handler=e=>{
  if(e.defaultPrevented||e.isComposing||document.querySelector('[data-shortcut-recording=true]'))return;
  if(e.key==='Escape'){if(!dialog){setQuery('');setChecked([]);setSelectionMode(false);selectionAnchor.current=null}return}
  if(dialog||document.querySelector('[role="dialog"]')||e.repeat)return;
  const action=shortcutAction(e,shortcuts,'global');if(!action)return;
  const editing=e.target?.closest?.('input,textarea,select,[contenteditable=true]');
  if(editing&&(action==='undo'||action==='redo'))return;
  e.preventDefault();
  if(action==='command')setDialog('command');
  else if(action==='capture')quickAdd();
  else if(action==='search')setDialog('command')
  else if(action==='undo')undo();else if(action==='redo')redo();
 };window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler)},[shortcuts,dialog,quickAdd,undo,redo]);
}
