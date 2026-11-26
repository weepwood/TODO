import {useReducer,useCallback,useRef} from 'react';
import {recordTaskChanges} from './core/task-activity.js';
export function historyReducer(state,action){
 if(action.type==='cli-clear')return state.cliReceipt?.result.id===action.id?{...state,cliReceipt:null}:state;
 if(action.type==='cli'){
  // The exact prepared snapshot is checked again in the reducer. If a UI,
  // sync, reminder or timer update raced with preparation, nothing is applied.
  if(state.cliReceipt)return state;
  const same=state.data===action.expected, data=same?action.next:state.data;
  const result=same?action.result:{id:action.result.id,status:'cancelled',result:{code:'STALE_WORKSPACE',error:'工作空间已变化，请重新查询并提交新请求'}};
  return {...state,data,cliReceipt:{data,result},...(data!==state.data?{past:[...state.past.slice(-29),state.data],future:[]}:{})};
 }
 if(action.type==='undo'||action.type==='redo'){
  const undo=action.type==='undo',items=undo?state.past:state.future;if(!items.length)return state;
  const target=undo?items.at(-1):items[0],data=recordTaskChanges(state.data,target,action.meta,{restore:true});
  return undo?{...state,data,past:state.past.slice(0,-1),future:[state.data,...state.future]}:{...state,data,past:[...state.past,state.data],future:state.future.slice(1)};
 }
 let data=typeof action.value==='function'?action.value(state.data):action.value;
 if(data===state.data)return state;
 if(action.meta&&action.record!==false)data=recordTaskChanges(state.data,data,action.meta);
 if(action.type==='system')return {...state,data,past:[],future:[]};
 if(action.type==='audit')return {...state,data};
 return {...state,data,past:[...state.past.slice(-29),state.data],future:[]};
}
export function useHistory(initial){
 const session=useRef(null);if(!session.current)session.current=crypto.randomUUID();
 const [state,dispatch]=useReducer(historyReducer,null,()=>({data:initial(),past:[],future:[]}));
 const actions=useHistoryActions(dispatch,session);
 return {data:state.data,...actions,canUndo:!!state.past.length,canRedo:!!state.future.length,session:session.current,cliReceipt:state.cliReceipt}
}
// Stable actions must not retain the initializer's original App render.
function useHistoryActions(dispatch,session){
 const meta=source=>({id:crypto.randomUUID(),at:new Date().toISOString(),source,session:session.current});
 const edit=useCallback((value,source='manual',record=true)=>dispatch({type:'edit',value,meta:meta(source),record}),[]);
 const system=useCallback((value,source)=>dispatch({type:'system',value,...(source?{meta:meta(source)}:{})}),[]);
 const audit=useCallback(value=>dispatch({type:'audit',value}),[]);
 const undo=useCallback(()=>dispatch({type:'undo',meta:meta('undo')}),[]);
 const redo=useCallback(()=>dispatch({type:'redo',meta:meta('redo')}),[]);
 const cliApply=useCallback((expected,next,result)=>dispatch({type:"cli",expected,next,result}),[]);
 const clearCliReceipt=useCallback(id=>dispatch({type:"cli-clear",id}),[]);
 return {edit,system,audit,undo,redo,cliApply,clearCliReceipt}
}
