// One activation sequence per main WebView. Never let a late activation or
// cleanup from an unmounted account overwrite a newer account's native scope.
export function createNativeActivationCoordinator(invoke){
 let owner=null,tail=Promise.resolve();
 function enqueue(work){
  const result=tail.then(work);tail=result.catch(()=>{});return result;
 }
 return {
  claim(scope){
   const token={scope};owner=token;
   // A new claim clears an old native scope before reading the new store.
   // The reset is ordered after any in-flight activation, even if it failed.
   const ready=enqueue(async()=>{
    if(owner!==token)return false;
    await invoke('native_activate',{scope:null});
    return owner===token;
   });
   return {
    ready,
    current:()=>owner===token,
    activate:async()=>{if(!await ready)return false;return enqueue(async()=>{
     if(owner!==token)return false;
     await invoke('native_activate',{scope});
     return owner===token;
    })},
    release:()=>{
     if(owner!==token)return Promise.resolve(false);
     owner=null;
     return enqueue(async()=>{
      if(owner!==null)return false;
      await invoke('native_activate',{scope:null});
      return true;
     });
    }
   };
  }
 };
}
