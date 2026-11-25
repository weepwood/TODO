import {useEffect,useState} from 'react';
export const WIDE_DETAIL_QUERY='(min-width: 1440px)';
export function useWideDetail(){
 const [wide,setWide]=useState(()=>window.matchMedia(WIDE_DETAIL_QUERY).matches);
 useEffect(()=>{const media=window.matchMedia(WIDE_DETAIL_QUERY),change=()=>setWide(media.matches);change();media.addEventListener('change',change);return()=>media.removeEventListener('change',change)},[]);
 return wide;
}
