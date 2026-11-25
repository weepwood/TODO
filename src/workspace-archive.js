import {migrateState} from './core/domain.js';
import {digest} from './services/cloud-core.js';
import {makeAttachmentArchive,parseAttachmentArchive} from './attachment-archive.js';
export const WORKSPACE_ARCHIVE_LIMIT=88*1024*1024;
const jsonSize=v=>new Blob([JSON.stringify(v)]).size;
export async function createWorkspaceArchive(scope,state){
 const workspace=migrateState(state);
 if(jsonSize(workspace)>15*1024*1024)throw Error('工作空间超过 15 MiB，请先整理数据');
 const attachments=await makeAttachmentArchive(scope);
 const archive={format:'todo-workspace-archive',version:1,createdAt:new Date().toISOString(),workspace,workspaceSha256:await digest(workspace),attachments};
 if(jsonSize(archive)>WORKSPACE_ARCHIVE_LIMIT)throw Error('完整归档超过 88 MiB');
 return archive;
}
export async function parseWorkspaceArchive(file){
 if(!file||file.size>WORKSPACE_ARCHIVE_LIMIT)throw Error('完整归档超过 88 MiB');
 const archive=JSON.parse(await file.text());
 if(archive?.format!=='todo-workspace-archive'||archive.version!==1||!archive.workspace||!archive.attachments||!(/^[a-f0-9]{64}$/.test(archive.workspaceSha256||'')))throw Error('不支持的完整归档');
 if(jsonSize(archive.workspace)>15*1024*1024)throw Error('工作空间超过 15 MiB');
 if(await digest(archive.workspace)!==archive.workspaceSha256)throw Error('工作空间校验失败');
 const workspace=migrateState(archive.workspace),attachments=await parseAttachmentArchive(new Blob([JSON.stringify(archive.attachments)]));
 const ids=new Set(workspace.tasks.map(t=>t.id));
 return {workspace,attachments,orphaned:attachments.filter(a=>!ids.has(a.taskId)).length};
}
