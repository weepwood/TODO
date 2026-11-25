import React,{useEffect,useRef,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {native,desktopNative} from '../../platform/runtime.js';
import {androidNative} from '../../platform/runtime.js';
import {newerRelease,readFeed,releaseChannel,RELEASE_BASE} from './protocol.js';
import pkg from '../../../package.json';
const signed=native&&(desktopNative||androidNative)&&import.meta.env.VITE_TODO_SIGNED_RELEASE==='1';
const channel=releaseChannel(pkg.version);
const messages={checking:'正在检查更新…',current:'当前已是此渠道最新版本',empty:'此渠道尚未发布正式签名更新',available:'发现新版本',downloading:'正在下载并验证更新',ready:'已验证，等待安装',installing:'正在交给系统安装器',permission:'请在系统设置允许此应用安装更新，返回后重试',confirm:'请确认系统安装',cancelled:'已取消下载',failed:'更新未完成'};
export function UpdatePanel({storage,scope,blocked,pauseSync}){
 const [state,setState]=useState('idle'),[release,setRelease]=useState(null),[progress,setProgress]=useState({received:0,total:0}),[error,setError]=useState(''),[auto,setAuto]=useState(()=>localStorage.getItem('todo-update-auto')!=='0');
 const running=useRef(false),controller=useRef(null),downloaded=useRef(null),mounted=useRef(true);
 const [nativeStatus,setNativeStatus]=useState('');
 const set=(s)=>{if(mounted.current)setState(s)};
 const fail=e=>{if(mounted.current){setError(String(e?.message||e));set('failed')}};
 const closeDownloaded=async()=>{const u=downloaded.current;downloaded.current=null;if(u)await u.close().catch(()=>{})};
 const check=async({quiet=false}={})=>{
  if(running.current||['downloading','installing','confirm'].includes(state))return;running.current=true;setError('');setNativeStatus('');setRelease(null);set('checking');await closeDownloaded();
  const abort=new AbortController();controller.current=abort;const timeout=setTimeout(()=>abort.abort(),12000);
  try{const r=await readFeed(channel,{signal:abort.signal});if(!mounted.current)return;const next=newerRelease(r,pkg.version);setRelease(next);set(next?'available':r?'current':'empty')}
  catch(e){if(!quiet)fail(e);else set('idle')}
  finally{clearTimeout(timeout);controller.current=null;running.current=false}
 };
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;controller.current?.abort();void closeDownloaded()}},[]);
 // Read native state on reopening; only poll while an operation is active.
 const refreshNative=async({restore=false}={})=>{
  const s=await invoke('plugin:todo-mobile|update_status');if(!mounted.current)return;
  setProgress({received:s.received||0,total:s.total||0});setNativeStatus(s.message||'');
  if(s.state==='downloading')set('downloading');
  else if(s.state==='installing')set('installing');
  else if(s.state==='confirmation')set('confirm');
  else if(s.state==='ready')setState(old=>old==='permission'?old:'ready');
  else if(s.state==='installed')set('current');
  else if(s.state==='failed'){if(!restore||s.message)setError(s.message||'更新失败');set('failed')}
  else if(s.state==='cancelled')set('cancelled');
 };
 useEffect(()=>{if(signed&&androidNative)void refreshNative({restore:true}).catch(()=>{});},[]);
 useEffect(()=>{
  if(!signed||!androidNative||!['downloading','installing','confirm'].includes(state))return;
  let checking=false;
  const t=setInterval(async()=>{if(checking)return;checking=true;try{await refreshNative()}catch(e){fail(e)}finally{checking=false}},600);
  return()=>clearInterval(t);
 },[state]);

 const download=async()=>{
  if(running.current||!release||!signed||blocked)return;
  running.current=true;setError('');set('downloading');setProgress({received:0,total:0});
  try{
   if(desktopNative){
    const {check:checkDesktop}=await import('@tauri-apps/plugin-updater');
    const u=await checkDesktop({timeout:15000});
    if(!u||u.version!==release.version){await u?.close();throw Error('签名更新清单与版本清单不一致，请重新检查')}
    downloaded.current=u;let received=0,total=0;
    await u.download(e=>{if(e.event==='Started')total=e.data.contentLength||0;if(e.event==='Progress')received+=e.data.chunkLength;if(mounted.current)setProgress({received,total})},{timeout:120000});
    if(!mounted.current){await closeDownloaded();return}set('ready');
   }else if(androidNative){
    const a=release.platforms['android-aarch64'];await invoke('plugin:todo-mobile|update_prepare',{version:release.version,versionCode:a.versionCode,url:a.url,sha256:a.sha256,size:a.size,certificate:a.certificate});
    set('downloading');
   }else throw Error('当前平台不支持应用内安装');
  }catch(e){await closeDownloaded();fail(e)}
  finally{running.current=false}
 };
 const prepareInstall=async()=>{
  if(blocked)throw Error('当前工作空间尚未安全保存');
  const resume=await pauseSync?.()||(()=>{});
  try{
   if(storage?.flush&&!await storage.flush())throw Error('本机保存失败，已阻止安装');
   await invoke('native_create_backup',{scope});
   if(storage?.flush&&!await storage.flush())throw Error('本机保存失败，已阻止安装');
   return resume;
  }catch(e){resume();throw e}
 };
 const install=async()=>{
  if(running.current||blocked||!signed)return;running.current=true;setError('');let resume;
  try{resume=await prepareInstall();set('installing');
   if(desktopNative){const u=downloaded.current;if(!u)throw Error('请重新下载更新');await u.install();const {relaunch}=await import('@tauri-apps/plugin-process');await relaunch()}
   else if(androidNative){const s=await invoke('plugin:todo-mobile|update_install');set(s.state==='permission'?'permission':'installing');setNativeStatus(s.message||'')}
  }catch(e){fail(e)}finally{resume?.();running.current=false}
 };
 const confirmInstall=async()=>{
  if(running.current||blocked)return;running.current=true;let resume;
  try{resume=await prepareInstall();await invoke('plugin:todo-mobile|update_confirm')}catch(e){fail(e)}finally{resume?.();running.current=false}
 };
 const cancel=async()=>{if(!androidNative)return;try{await invoke('plugin:todo-mobile|update_cancel');setNativeStatus('正在取消…')}catch(e){fail(e)}};
 return <section className="update-panel" aria-label="软件更新">
  <div className="update-heading"><div><h3>软件更新</h3><p className="muted small">当前版本 {pkg.version} · {channel==='preview'?'预发行渠道':'稳定渠道'}</p></div><span className="small muted">{signed?'签名发行版':'开发 / 测试版'}</span></div>
  <label className="small"><input type="checkbox" checked={auto} onChange={e=>{setAuto(e.target.checked);localStorage.setItem('todo-update-auto',e.target.checked?'1':'0')}}/> 自动检查更新（仅检查，不自动安装）</label>
  {state!=='idle'&&<p role="status" className="small">{messages[state]||state}{nativeStatus?' · '+nativeStatus:''}</p>}
  {release&&<div className="update-release"><strong>V{release.version}</strong><p className="small">{release.notes||'版本更新'}</p><small>{new Date(release.publishedAt).toLocaleDateString()}</small></div>}
  {state==='downloading'&&<><progress aria-label="更新下载进度" max={progress.total||1} value={progress.total?Math.min(progress.received,progress.total):undefined}/><p className="muted small">{Math.round(progress.received/1024/1024*10)/10} MB{progress.total?' / '+Math.round(progress.total/1024/1024*10)/10+' MB':''}</p></>}
  {error&&<p role="alert" className="small error">{error}</p>}
  {!signed&&<p className="muted small">此构建未配置正式发布签名，仅支持检查。QA 包与正式包不能直接覆盖安装。</p>}
  <div className="button-grid">
   <button className="secondary" disabled={['checking','downloading','installing','confirm'].includes(state)} onClick={()=>check()}>检查更新</button>
   {signed&&release&&['available','failed','cancelled'].includes(state)&&<button className="primary" disabled={blocked} onClick={download}>下载并验证</button>}
   {signed&&['ready','permission'].includes(state)&&<button className="primary" disabled={blocked} onClick={install}>安装更新</button>}
   {androidNative&&state==='confirm'&&<button className="primary" disabled={blocked} onClick={confirmInstall}>打开系统安装确认</button>}
   {androidNative&&state==='downloading'&&<button className="secondary" onClick={cancel}>取消下载</button>}
  </div>
  <p className="muted small">{native?<span>发布记录：github.com/weepwood/TODO/releases</span>:<a href={RELEASE_BASE} target="_blank" rel="noreferrer">查看发布记录</a>} · 更新前保存 SQLite 并创建备份；不强制升级。</p>
 </section>
}
