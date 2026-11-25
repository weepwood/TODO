import {initialState,migrateState,STORAGE_KEY,BACKUP_KEY} from '../core/domain.js';
export function scopedStorage(storage,uid){if(!uid)return storage;const prefix='todo-account:'+uid+':';return {getItem:key=>storage.getItem(prefix+key),setItem:(key,value)=>storage.setItem(prefix+key,value),removeItem:key=>storage.removeItem(prefix+key)}}
export function canonical(value){if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';return JSON.stringify(value)}
export async function digest(state){const buffer=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(state)));return Array.from(new Uint8Array(buffer),x=>x.toString(16).padStart(2,'0')).join('')}
export const META_KEY='todo-cloud-meta';
export function readMeta(storage){const raw=storage.getItem(META_KEY);if(!raw)return null;const m=JSON.parse(raw);if(!Number.isSafeInteger(m.revision)||m.revision<1||!/^[a-f0-9]{64}$/.test(m.hash))throw new Error('同步元数据损坏，请导出本地数据');return m}
export function decideSync({localHash,remoteHash,remoteRevision,meta,emptyHash}){
 if(remoteRevision===null){if(meta)return 'conflict';return localHash===emptyHash?'empty':'insert'}
 if(localHash===remoteHash)return 'ack';
 if(!meta)return localHash===emptyHash?'pull':'conflict';
 const dirty=localHash!==meta.hash,changed=remoteRevision!==meta.revision;
 if(dirty&&changed)return 'conflict';
 if(changed)return 'pull';
 if(dirty)return 'push';
 return 'ack';
}
export function readRemote(row){if(!row)return null;if(!Number.isSafeInteger(row.revision)||row.revision<1)throw Error('云端版本无效');return {...row,state:migrateState(row.state)}}
export function preserveConflict(storage,data){storage.setItem('todo-conflict-backup',JSON.stringify(data))}

export function authErrorMessage(error){
 const code=error?.code,message=String(error?.message||'');
 if(code==='over_email_send_rate_limit'||/email rate limit exceeded/i.test(message))return '确认邮件发送额度已用完。请稍后重试，或联系管理员创建已确认账号；不要连续提交注册请求。';
 if(code==='email_address_not_authorized')return '当前邮件服务不允许向此地址投递。请联系管理员配置邮件服务。';
 if(code==='email_not_confirmed')return '邮箱尚未确认，请检查确认邮件或联系管理员。';
 if(code==='invalid_credentials')return '邮箱或密码不正确。';
 if(error?.status===429)return '请求过于频繁，请稍后重试。';
 return message||'认证失败';
}
