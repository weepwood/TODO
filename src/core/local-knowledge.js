export const associationKey=id=>'todo-obsidian-link-v1:'+encodeURIComponent(id);
export function obsidianURI(vault,file){
 if(typeof vault!=='string'||typeof file!=='string'||!vault.trim()||vault.length>100||!file.trim()||file.length>500||/[\u0000-\u001f\u007f]/.test(vault+file)||file.trim().startsWith('/')||/^[a-z]:/i.test(file.trim())||file.includes('\\')||file.trim().split('/').some(x=>x==='..'||x==='.'))return null;
 return 'obsidian://open?vault='+encodeURIComponent(vault.trim())+'&file='+encodeURIComponent(file.trim());
}
export function readAssociation(storage,id){
 const raw=storage.getItem(associationKey(id));if(raw===null)return null;const row=JSON.parse(raw);if(!obsidianURI(row.vault,row.file))throw Error('关联记录无效，原记录保留');return row;
}
export function saveAssociation(storage,id,vault,file){
 if(!obsidianURI(vault,file))throw Error('请输入有效的知识库名称和相对文件路径');
 const row={vault:vault.trim(),file:file.trim()};storage.setItem(associationKey(id),JSON.stringify(row));return row;
}
export function historicalSearch(data,archived,query,kind){
 const q=query.trim().normalize('NFKC').toLocaleLowerCase(),lists=new Map(data.lists.map(l=>[l.id,l.name])),set=new Set(archived);
 return data.tasks.filter(t=>!t.deletedAt&&(kind==='archived'?set.has(t.listId):kind==='completed'?t.status==='completed':kind==='skipped'?t.status==='skipped':set.has(t.listId)||['completed','skipped'].includes(t.status))&&(!q||[t.title,t.notes,lists.get(t.listId)||''].some(v=>String(v).normalize('NFKC').toLocaleLowerCase().includes(q)))).sort((a,b)=>(b.completedAt||b.createdAt).localeCompare(a.completedAt||a.createdAt)||a.id.localeCompare(b.id));
}
