import {STORAGE_KEY} from '../core/domain.js';
export const CLOUD_WORKSPACE_MAX_BYTES=3500000;
export function assertCloudCapacity(state){
 const bytes=new TextEncoder().encode(JSON.stringify(state)).length;
 if(bytes>CLOUD_WORKSPACE_MAX_BYTES)throw Error('工作空间超过 3.5 MB，请导出备份并整理历史记录');
 return bytes;
}
// Await only actual asynchronous stores. A sync request must not publish an
// unstaged or superseded UI snapshot, or acknowledge uncommitted metadata.
export async function requireCommittedStorage(storage){
 if(storage.flush&&!await storage.flush())throw Error('本机事务尚未提交，请重试保存或导出数据');
}
export async function prepareSyncSnapshot(storage,snapshot,isCurrent){
 if(!isCurrent())return false;
 if(storage.flush){
  const raw=JSON.stringify(snapshot);
  if(storage.getItem(STORAGE_KEY)!==raw)return false;
  await requireCommittedStorage(storage);
  if(storage.getItem(STORAGE_KEY)!==raw)return false;
 }
 return isCurrent();
}
