import {useEffect,useState} from 'react';
export function useCompactLayout(){
 const [compact,setCompact]=useState(()=>window.matchMedia('(max-width: 860px)').matches);
 useEffect(()=>{const media=window.matchMedia('(max-width: 860px)'),change=()=>setCompact(media.matches);change();media.addEventListener('change',change);return()=>media.removeEventListener('change',change)},[]);
 return compact
}
