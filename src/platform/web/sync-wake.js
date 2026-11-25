// Mobile foreground re-entry can occur without a focus event.
export function subscribeSyncWake(run,{win=window,doc=document,interval=15000,foregroundOnly=false}={}){
 const wake=()=>{if(!foregroundOnly||doc.visibilityState!=='hidden')run()};
 const visible=()=>{if(doc.visibilityState==='visible')wake()};
 const timer=win.setInterval(wake,interval);
 win.addEventListener('online',wake);win.addEventListener('focus',wake);doc.addEventListener('visibilitychange',visible);
 return()=>{win.clearInterval(timer);win.removeEventListener('online',wake);win.removeEventListener('focus',wake);doc.removeEventListener('visibilitychange',visible)};
}
