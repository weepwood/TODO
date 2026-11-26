//! Shared SQLite storage, snapshots, backup and index transactions.
use super::*;
pub(super) fn valid_scope(s:&str)->bool { s=="guest" || (s.len()==36 && s.chars().all(|c|c.is_ascii_hexdigit()||c=='-')) }
pub(super) fn schema(c:&Connection)->rusqlite::Result<()> {
 c.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS snapshots(scope TEXT PRIMARY KEY, body TEXT NOT NULL, updated_at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS backups(scope TEXT NOT NULL, body TEXT NOT NULL, saved_at INTEGER NOT NULL, PRIMARY KEY(scope,saved_at)); CREATE TABLE IF NOT EXISTS delivered(scope TEXT NOT NULL, reminder TEXT NOT NULL, PRIMARY KEY(scope,reminder)); CREATE TABLE IF NOT EXISTS direct_capture_requests(scope TEXT NOT NULL,id TEXT NOT NULL,generation INTEGER NOT NULL,text TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('pending','saved','cancelled')),created_at INTEGER NOT NULL,PRIMARY KEY(scope,id)); CREATE UNIQUE INDEX IF NOT EXISTS direct_capture_one_pending ON direct_capture_requests(scope) WHERE status='pending'; CREATE TABLE IF NOT EXISTS cli_binding(slot INTEGER PRIMARY KEY CHECK(slot=1),scope TEXT NOT NULL); CREATE TABLE IF NOT EXISTS cli_capture_meta(scope TEXT NOT NULL,id TEXT NOT NULL,digest TEXT NOT NULL,task_count INTEGER NOT NULL CHECK(task_count BETWEEN 1 AND 50),PRIMARY KEY(scope,id),FOREIGN KEY(scope,id) REFERENCES direct_capture_requests(scope,id) ON DELETE CASCADE); CREATE TABLE IF NOT EXISTS cli_operation_meta(scope TEXT NOT NULL,id TEXT NOT NULL,digest TEXT NOT NULL,kind TEXT NOT NULL,result TEXT,PRIMARY KEY(scope,id),FOREIGN KEY(scope,id) REFERENCES direct_capture_requests(scope,id) ON DELETE CASCADE); CREATE TABLE IF NOT EXISTS cli_management_v3(version INTEGER PRIMARY KEY CHECK(version=3)); INSERT OR IGNORE INTO cli_management_v3(version) VALUES(3); CREATE TABLE IF NOT EXISTS cli_operation_access(slot INTEGER PRIMARY KEY CHECK(slot=1),scope TEXT NOT NULL); CREATE TABLE IF NOT EXISTS reminder_retry(scope TEXT NOT NULL, reminder TEXT NOT NULL, attempts INTEGER NOT NULL, next_at INTEGER NOT NULL, PRIMARY KEY(scope,reminder)); CREATE TABLE IF NOT EXISTS workspace_store(scope TEXT PRIMARY KEY, body TEXT NOT NULL); CREATE VIRTUAL TABLE IF NOT EXISTS task_search USING fts5(scope UNINDEXED, task_id UNINDEXED, title, notes, tokenize='trigram');")?;
 operation_history::history_schema(c)
}
pub(super) fn save(c:&mut Connection,scope:&str,body:&str)->Result<(),String>{save_with_store(c,scope,body,None)}
pub(super) fn save_with_store(c:&mut Connection,scope:&str,body:&str,store:Option<&str>)->Result<(),String>{save_with_receipt(c,scope,body,store,None)}
fn save_with_receipt(c:&mut Connection,scope:&str,body:&str,store:Option<&str>,receipt:Option<&serde_json::Value>)->Result<(),String>{
 if !valid_scope(scope)||body.len()>16_000_000{return Err("无效工作空间或数据过大".into())}
 let state:serde_json::Value=serde_json::from_str(body).map_err(|e|e.to_string())?;
 if state["version"]!=2||!state["tasks"].is_array(){return Err("不支持的工作空间格式".into())}
 let now=Local::now().timestamp();let tx=c.transaction().map_err(|e|e.to_string())?;
 // The operation receipt is local metadata. Validate the pending request and
 // terminal response before modifying any workspace rows. A retry of the
 // identical already-committed receipt cannot overwrite a newer snapshot.
 let op=if let Some(r)=receipt{
  let id=r["id"].as_str().filter(|v|uuid::Uuid::parse_str(v).is_ok()).ok_or("invalid receipt id")?;
  let status=r["status"].as_str().filter(|v|matches!(*v,"saved"|"cancelled")).ok_or("invalid receipt status")?;
  let result=r["result"].as_object().ok_or("invalid receipt result")?;
  let raw=serde_json::Value::Object(result.clone()).to_string();
  if raw.len()>524288{return Err("receipt too large".into())}
  let queue_scope=format!("cli-op:{scope}");
  let existing:Option<(String,Option<String>,String)>=tx.query_row("SELECT d.status,m.result,m.kind FROM direct_capture_requests d JOIN cli_operation_meta m ON d.scope=m.scope AND d.id=m.id WHERE d.scope=?1 AND d.id=?2",params![&queue_scope,id],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).optional().map_err(|e|e.to_string())?;
  let (old,old_result,kind)=existing.ok_or("operation request missing")?;
  if old!="pending"{
   if old==status&&old_result.as_deref()==Some(raw.as_str()){return Ok(())}
   return Err("operation already finalized".into())
  }
  if kind!="create"&&!cli::advanced_scope(&tx,scope)?{return Err("advanced CLI access not authorized".into())}
  Some((queue_scope,id.to_owned(),status.to_owned(),raw))
 }else{None};
 let prior:Option<String>=tx.query_row("SELECT body FROM snapshots WHERE scope=?1",[scope],|r|r.get(0)).optional().map_err(|e|e.to_string())?;
 if prior.as_deref()!=Some(body){
 tx.execute("INSERT OR IGNORE INTO backups SELECT scope,body,?2 FROM snapshots WHERE scope=?1 AND NOT EXISTS(SELECT 1 FROM backups WHERE scope=?1 AND saved_at>?2-3600)",params![scope,now]).map_err(|e|e.to_string())?;
 tx.execute("DELETE FROM backups WHERE scope=?1 AND saved_at NOT IN (SELECT saved_at FROM backups WHERE scope=?1 ORDER BY saved_at DESC LIMIT 24)",[scope]).map_err(|e|e.to_string())?;
 tx.execute("INSERT INTO snapshots VALUES(?1,?2,?3) ON CONFLICT(scope) DO UPDATE SET body=excluded.body,updated_at=excluded.updated_at",params![scope,body,now]).map_err(|e|e.to_string())?;
 let prior_state=prior.as_ref().and_then(|x|serde_json::from_str::<serde_json::Value>(x).ok());
 update_index(&tx,scope,prior_state.as_ref(),&state).map_err(|e|e.to_string())?;
 // Identify the actual pending request rather than trust model-supplied source.
 let mut info:Option<(String,String,String)>=None;
 if let Some((queue,id,status,_))=&op{
  if status=="saved"{
   let (kind,text):(String,String)=tx.query_row("SELECT m.kind,d.text FROM cli_operation_meta m JOIN direct_capture_requests d USING(scope,id) WHERE m.scope=?1 AND m.id=?2",params![queue,id],|r|Ok((r.get(0)?,r.get(1)?))).map_err(|e|e.to_string())?;
   let group=serde_json::from_str::<serde_json::Value>(&text).ok().and_then(|v|v["operationGroup"].as_str().filter(|g|uuid::Uuid::parse_str(g).is_ok()).map(str::to_owned)).unwrap_or_else(||id.clone());
   info=Some((id.clone(),kind,group));
  }
 }else{
  let capture:Option<String>=tx.query_row("SELECT d.id FROM direct_capture_requests d JOIN cli_capture_meta m USING(scope,id) WHERE d.scope='cli:'||?1 AND d.status='pending' AND m.task_count=(SELECT count(DISTINCT json_extract(t.value,'$.id')) FROM json_each(?2,'$.tasks') t WHERE json_extract(t.value,'$.id') IN (SELECT d.id||':'||n FROM (WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n<50) SELECT n FROM seq) WHERE n<=m.task_count))",params![scope,body],|r|r.get(0)).optional().map_err(|e|e.to_string())?;
  if let Some(id)=capture{info=Some((id.clone(),"batch-capture".into(),id))}
 }
 operation_history::append_history(&tx,scope,prior_state.as_ref(),&state,now,info.as_ref().map(|(id,k,g)|(id.as_str(),k.as_str(),g.as_str(),receipt.and_then(|r|r["result"].get("userConfirmation")))))?;

 }
 // Mark receipt atomically with snapshot, never infer success from frontend memory.
 tx.execute("UPDATE direct_capture_requests SET status='saved',text='' WHERE scope=?1 AND status='pending' AND NOT EXISTS(SELECT 1 FROM cli_capture_meta m WHERE m.scope=direct_capture_requests.scope AND m.id=direct_capture_requests.id) AND id IN (SELECT json_extract(value,'$.id') FROM json_each(?2,'$.tasks'))",params![scope,body]).map_err(|e|e.to_string())?;
 // Structured batch receipt is committed only when every deterministic task ID exists.
 tx.execute("UPDATE direct_capture_requests AS d SET status='saved',text='' WHERE d.scope='cli:'||?1 AND d.status='pending' AND EXISTS(SELECT 1 FROM cli_capture_meta m WHERE m.scope=d.scope AND m.id=d.id AND m.task_count=(SELECT count(DISTINCT json_extract(t.value,'$.id')) FROM json_each(?2,'$.tasks') t WHERE json_extract(t.value,'$.id') IN (SELECT d.id||':'||n FROM (WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n<50) SELECT n FROM seq) WHERE n<=m.task_count)))",params![scope,body]).map_err(|e|e.to_string())?;
 if let Some(store)=store{tx.execute("INSERT INTO workspace_store VALUES(?1,?2) ON CONFLICT(scope) DO UPDATE SET body=excluded.body",params![scope,store]).map_err(|e|e.to_string())?;}
 if let Some((queue_scope,id,status,result))=op{
  if tx.execute("UPDATE direct_capture_requests SET status=?3,text='' WHERE scope=?1 AND id=?2 AND status='pending'",params![&queue_scope,&id,&status]).map_err(|e|e.to_string())?!=1{return Err("operation state changed".into())}
  if tx.execute("UPDATE cli_operation_meta SET result=?3 WHERE scope=?1 AND id=?2",params![&queue_scope,&id,&result]).map_err(|e|e.to_string())?!=1{return Err("operation receipt missing".into())}
 }
 tx.commit().map_err(|e|e.to_string())
}
fn index_values(state:&serde_json::Value)->std::collections::BTreeMap<String,(String,String)>{
 let mut out=std::collections::BTreeMap::new();
 if let Some(tasks)=state["tasks"].as_array(){for t in tasks{if t["deletedAt"].is_null(){if let Some(id)=t["id"].as_str(){out.insert(id.to_owned(),(t["title"].as_str().unwrap_or("").to_owned(),t["notes"].as_str().unwrap_or("").to_owned()));}}}}
 out
}
fn update_index(c:&Connection,scope:&str,prior:Option<&serde_json::Value>,state:&serde_json::Value)->rusqlite::Result<()>{
 let next=index_values(state);
 let old=prior.map(index_values).unwrap_or_default();
 let changed:Vec<_>=old.keys().chain(next.keys()).collect::<std::collections::BTreeSet<_>>().into_iter().filter(|id|old.get(*id)!=next.get(*id)).collect();
 if prior.is_none()||changed.len()>100{
  c.execute("DELETE FROM task_search WHERE scope=?1",[scope])?;
  let mut q=c.prepare("INSERT INTO task_search VALUES(?1,?2,?3,?4)")?;
  for (id,(title,notes)) in next{q.execute(params![scope,id,title,notes])?;}
 }else{
  let mut del=c.prepare("DELETE FROM task_search WHERE scope=?1 AND task_id=?2")?;
  let mut put=c.prepare("INSERT INTO task_search VALUES(?1,?2,?3,?4)")?;
  for id in changed{del.execute(params![scope,id])?;if let Some((title,notes))=next.get(id){put.execute(params![scope,id,title,notes])?;}}
 }
 Ok(())
}
pub(super) fn create_backup(c:&mut Connection,scope:&str)->Result<(),String>{
 if !valid_scope(scope){return Err("invalid scope".into())}
 let now=Local::now().timestamp();
 let tx=c.transaction().map_err(|e|e.to_string())?;
 let count=tx.execute("INSERT INTO backups(scope,body,saved_at) SELECT scope,body,MAX(?2,COALESCE((SELECT MAX(saved_at)+1 FROM backups WHERE scope=?1),?2)) FROM snapshots WHERE scope=?1",params![scope,now]).map_err(|e|e.to_string())?;
 if count!=1{return Err("没有可备份的工作空间".into())}
 tx.execute("DELETE FROM backups WHERE scope=?1 AND saved_at NOT IN (SELECT saved_at FROM backups WHERE scope=?1 ORDER BY saved_at DESC LIMIT 24)",[scope]).map_err(|e|e.to_string())?;
 tx.commit().map_err(|e|e.to_string())
}
pub(super) fn persist_store(c:&mut Connection,scope:&str,store:&str)->Result<(),String>{persist_store_receipt(c,scope,store,None)}
pub(super) fn persist_store_receipt(c:&mut Connection,scope:&str,store:&str,receipt:Option<&serde_json::Value>)->Result<(),String>{
 if !valid_scope(scope)||store.len()>64_000_000{return Err("工作空间存储过大或标识无效".into())}
 let value:serde_json::Value=serde_json::from_str(store).map_err(|e|e.to_string())?;
 let map=value.as_object().ok_or("无效工作空间存储")?;
 let keys=["todo-workbench-v1","todo-workbench-backup","todo-workbench-backup-at","todo-workbench-backup-corrupt","todo-cloud-meta","todo-cloud-base","todo-conflict-backup","todo-field-merge-backup","todo-native-migration-backup"];
 if map.iter().any(|(k,v)|!keys.contains(&k.as_str())||!v.is_string()){return Err("工作空间存储键无效".into())}
 let body=map.get("todo-workbench-v1").and_then(|x|x.as_str()).ok_or("缺少工作空间数据")?;
 save_with_receipt(c,scope,body,Some(store),receipt)
}
