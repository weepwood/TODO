import React,{useState} from 'react';
import {makePreferenceProfile,validPreferenceProfile} from '../core/preference-sync.js';
export function PreferenceSyncPanel({data,viewPrefs,session,blocked,publish}){
 const [status,setStatus]=useState('');
 const profile=data.preferenceProfile,valid=validPreferenceProfile(profile);
 return <section className="settings-preference-sync"><h3>跨设备清单偏好</h3><p className="muted small">同步收藏、任务置顶、清单默认属性及排序分组。布局尺寸、折叠状态、归档、快捷键与定时规则仍保留在本机。发布和应用都需要明确确认。</p>
 <div className="preference-sync-summary"><strong>{valid?'已有共享偏好':'尚未发布共享偏好'}</strong>{valid&&<small>{new Date(profile.savedAt).toLocaleString('zh-CN')} · {Object.keys(profile.value.views).length} 个视图</small>}</div>
 <div className="preference-sync-actions"><button className="secondary" disabled={!session||blocked} onClick={()=>{if(!confirm('将当前本机清单偏好发布到共享工作空间？其他设备可选择应用。'))return;const next=makePreferenceProfile(viewPrefs.portableState);if(!validPreferenceProfile(next)){setStatus('偏好超过大小限制或无效');return}publish(next);setStatus('已更新工作空间共享偏好，等待云同步')}}>发布本机偏好</button><button className="secondary" disabled={!session||blocked||!valid} onClick={()=>{if(confirm('应用共享偏好？将先备份当前本机设置，不改变任务。'))setStatus(viewPrefs.applyProfile(profile)?'已应用共享偏好':'应用失败，检查存储')}}>应用共享偏好</button><button className="secondary" disabled={blocked} onClick={()=>{if(confirm('恢复上次应用前的本机偏好？'))setStatus(viewPrefs.restoreProfile()?'已恢复本机偏好':'没有可恢复备份或存储失败')}}>恢复本机偏好</button></div>
 {!session&&<p className="muted small">登录后可发布与应用共享偏好。</p>}{status&&<p role="status" className="muted small">{status}</p>}</section>
}
