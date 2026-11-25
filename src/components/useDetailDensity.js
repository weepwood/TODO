import {useState,useRef,useEffect} from 'react';
import {DETAIL_DENSITY_KEY,DETAIL_ORDER_KEY,readDetailDensity,readDetailOrder,setDetailDensity,moveDetailSection} from '../core/detail-density.js';
export function useDetailDensity(storage){
 const [state,setState]=useState(()=>readDetailDensity(storage)),latest=useRef(state);
 const [order,setOrder]=useState(()=>readDetailOrder(storage)),latestOrder=useRef(order);
 useEffect(()=>{const next=readDetailDensity(storage),sorted=readDetailOrder(storage);latest.current=next;latestOrder.current=sorted;setState(next);setOrder(sorted)},[storage]);
 const persist=(key,value)=>{try{storage.setItem(key,JSON.stringify(value))}catch{/* View preference remains usable in memory. */}};
 const change=(id,mode)=>{
  const next=setDetailDensity(latest.current,id,mode);latest.current=next;setState(next);persist(DETAIL_DENSITY_KEY,next);
 };
 const reorder=(active,over)=>{
  const next=moveDetailSection(latestOrder.current,active,over);
  if(next===latestOrder.current)return;
  latestOrder.current=next;setOrder(next);persist(DETAIL_ORDER_KEY,next);
 };
 return [state,change,order,reorder];
}
