import {useReducer,useCallback} from 'react';
function reducer(state,action){
 if(action.type==='undo'){if(!state.past.length)return state;return {data:state.past.at(-1),past:state.past.slice(0,-1),future:[state.data,...state.future]}}
 if(action.type==='redo'){if(!state.future.length)return state;return {data:state.future[0],past:[...state.past,state.data],future:state.future.slice(1)}}
 const data=typeof action.value==='function'?action.value(state.data):action.value;
 if(data===state.data)return state;
 if(action.type==='system')return {data,past:[],future:[]};
 return {data,past:[...state.past.slice(-29),state.data],future:[]}
}
export function useHistory(initial){
 const [state,dispatch]=useReducer(reducer,null,()=>({data:initial(),past:[],future:[]}));
 const edit=useCallback(value=>dispatch({type:'edit',value}),[]);
 const system=useCallback(value=>dispatch({type:'system',value}),[]);
 const undo=useCallback(()=>dispatch({type:'undo'}),[]);
 const redo=useCallback(()=>dispatch({type:'redo'}),[]);
 return {data:state.data,edit,system,undo,redo,canUndo:!!state.past.length,canRedo:!!state.future.length}
}
