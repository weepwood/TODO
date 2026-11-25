import {useReducer,useCallback,useRef} from 'react';
import {recordTaskChanges} from './core/task-activity.js';
export function historyReducer(state,action){
 if(action.type==='undo'||action.type==='redo'){
  const undo=action.type==='undo',items=undo?state.past:state.future;if(!items.length)return state;
  const target=undo?items.at(-1):items[0],data=recordTaskChanges(state.data,target,action.meta,{restore:true});
  return undo?{data,past:state.past.slice(0,-1),future:[state.data,...state.future]}:{data,past:[...state.past,state.data],future:state.future.slice(1)};
 }
 let data=typeof action.value==='function'?action.value(state.data):action.value;
 if(data===state.data)return state;
 if(action.meta&&action.record!==false)data=recordTaskChanges(state.data,data,action.meta);
 if(action.type==='system')return {data,past:[],future:[]};
 if(action.type==='audit')return {...state,data};
 return {data,past:[...state.past.slice(-29),state.data],future:[]};
}
export function useHistory(initial){
 const session=useRef(null);if(!session.current)session.current=crypto.randomUUID();
 const [state,dispatch]=useReducer(historyReducer,null,()=>({data:initial(),past:[],future:[]}));
 const meta=source=>({id:crypto.randomUUID(),at:new Date().toISOString(),source,session:session.current});
 const edit=useCallback((value,source='manual',record=true)=>dispatch({type:'edit',value,meta:meta(source),record}),[]);
 const system=useCallback((value,source)=>dispatch({type:'system',value,...(source?{meta:meta(source)}:{})}),[]);
 const audit=useCallback(value=>dispatch({type:'audit',value}),[]);
 const undo=useCallback(()=>dispatch({type:'undo',meta:meta('undo')}),[]);
 const redo=useCallback(()=>dispatch({type:'redo',meta:meta('redo')}),[]);
 return {data:state.data,edit,system,audit,undo,redo,canUndo:!!state.past.length,canRedo:!!state.future.length,session:session.current}
}
