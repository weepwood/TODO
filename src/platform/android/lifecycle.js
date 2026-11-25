import {useEffect,useRef} from 'react';
// Navigation-only history marker: never use the browser back stack to discard a
// workspace. The root back action is intentionally left to the platform.
export function mobileBackAction({modal,detail,sidebar,module,view}){
 if(modal)return 'modal';if(detail)return 'detail';if(sidebar)return 'sidebar';
 if(module!=='tasks'||view!=='today')return 'today';return 'root';
}
export function useMobileLifecycle({enabled,storage,onError,onBack}){
 const latest=useRef({onError,onBack});latest.current={onError,onBack};
 useEffect(()=>{if(!enabled)return;
 const flush=()=>{storage?.flush?.().then(ok=>{if(!ok)latest.current.onError('本机保存失败，请返回应用重试保存。')}).catch(()=>latest.current.onError('本机保存失败，请返回应用重试保存。'))};
 const visibility=()=>{if(document.visibilityState==='hidden')flush()};
 // Native Android Activity dispatches this function; Escape/BrowserBack also work in a WebView.
 const back=()=>Boolean(latest.current.onBack());window.__todoAndroidBack=back;
 const key=e=>{if(e.key==='Escape'||e.key==='BrowserBack'){if(latest.current.onBack()){e.preventDefault();e.stopPropagation()}}};
 document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',flush);window.addEventListener('todo-native-pause',flush);window.addEventListener('keydown',key,true);
 return()=>{document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',flush);window.removeEventListener('todo-native-pause',flush);if(window.__todoAndroidBack===back)delete window.__todoAndroidBack;window.removeEventListener('keydown',key,true)};
 },[enabled,storage]);
 useEffect(()=>{if(!enabled||!window.visualViewport)return;const viewport=window.visualViewport;
 const update=()=>{const inset=Math.max(0,window.innerHeight-viewport.height-viewport.offsetTop);document.documentElement.style.setProperty('--mobile-visual-height',viewport.height+'px');document.documentElement.toggleAttribute('data-mobile-keyboard',inset>100)};
 viewport.addEventListener('resize',update);viewport.addEventListener('scroll',update);update();
 return()=>{viewport.removeEventListener('resize',update);viewport.removeEventListener('scroll',update);document.documentElement.style.removeProperty('--mobile-visual-height');document.documentElement.removeAttribute('data-mobile-keyboard')};
 },[enabled]);
}
