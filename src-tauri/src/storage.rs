//! Shared SQLite storage, snapshots, backup and index transactions.
use sha2::{Digest,Sha256};
use super::*;
pub(super) fn valid_scope(s:&str)->bool { s=="guest" || (s.len()==36 && s.chars().all(|c|c.is_ascii_hexdigit()||c=='-')) }
pub(super) fn schema(c:&Connection)->rusqlite::Result<()> {
 c.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS snapshots(scope TEXT PRIMARY KEY, body TEXT NOT NULL, updated_at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS backups(scope TEXT NOT NULL, body TEXT NOT NULL, saved_at INTEGER NOT NULL, PRIMARY KEY(scope,saved_at)); CREATE TABLE IF NOT EXISTS delivered(scope TEXT NOT NULL, reminder TEXT NOT NULL, PRIMARY KEY(scope,reminder)); CREATE TABLE IF NOT EXISTS direct_capture_requests(scope TEXT NOT NULL,id TEXT NOT NULL,generation INTEGER NOT NULL,text TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('pending','saved','cancelled')),created_at INTEGER NOT NULL,PRIMARY KEY(scope,id)); CREATE UNIQUE INDEX IF NOT EXISTS direct_capture_one_pending ON direct_capture_requests(scope) WHERE status='pending'; CREATE TABLE IF NOT EXISTS cli_binding(slot INTEGER PRIMARY KEY CHECK(slot=1),scope TEXT NOT NULL); CREATE TABLE IF NOT EXISTS cli_capture_meta(scope TEXT NOT NULL,id TEXT NOT NULL,digest TEXT NOT NULL,task_count INTEGER NOT NULL CHECK(task_count BETWEEN 1 AND 50),PRIMARY KEY(scope,id),FOREIGN KEY(scope,id) REFERENCES direct_capture_requests(scope,id) ON DELETE CASCADE); CREATE TABLE IF NOT EXISTS cli_operation_meta(scope TEXT NOT NULL,id TEXT NOT NULL,digest TEXT NOT NULL,kind TEXT NOT NULL,result TEXT,PRIMARY KEY(scope,id),FOREIGN KEY(scope,id) REFERENCES direct_capture_requests(scope,id) ON DELETE CASCADE); CREATE TABLE IF NOT EXISTS cli_management_v3(version INTEGER PRIMARY KEY CHECK(version=3)); INSERT OR IGNORE INTO cli_management_v3(version) VALUES(3); CREATE TABLE IF NOT EXISTS cli_operation_access(slot INTEGER PRIMARY KEY CHECK(slot=1),scope TEXT NOT NULL); CREATE TABLE IF NOT EXISTS reminder_retry(scope TEXT NOT NULL, reminder TEXT NOT NULL, attempts INTEGER NOT NULL, next_at INTEGER NOT NULL, PRIMARY KEY(scope,reminder)); CREATE TABLE IF NOT EXISTS workspace_store(scope TEXT PRIMARY KEY, body TEXT NOT NULL); CREATE VIRTUAL TABLE IF NOT EXISTS task_search USING fts5(scope UNINDEXED, task_id UNINDEXED, title, notes, tokenize='trigram');")?;
 operation_history::history_schema(c)
}
pub(super) fn save(c:&mut Connection,scope:&str,body:&str)->Result<(),String>{save_with_store(c,scope,body,None)}
pub(super) fn save_with_store(c:&mut Connection,scope:&str,body:&str,store:Option<&str>)->Result<(),String>{save_with_receipt(c,scope,body,store,None)}
// The main WebView is trusted to establish human approval. Independently
// bind the final history receipt to its persisted preview and exact mutation.
pub(super) fn validate_history_commit(c:&Connection,scope:&str,id:&str,prior:&serde_json::Value,next:&serde_json::Value,result:&serde_json::Value,now:i64)->Result<(),String>{
 use serde_json::Value;
 let raw:String=c.query_row("SELECT text FROM direct_capture_requests WHERE scope='cli-op:'||?1 AND id=?2",params![scope,id],|r|r.get(0)).map_err(|e|e.to_string())?;
 let request:Value=serde_json::from_str(&raw).map_err(|e|e.to_string())?;
 let preview=request["previewId"].as_str().ok_or("missing preview")?;
 if request["confirm"]!=true||result["preview_id"]!=preview||result["userConfirmation"]["method"]!="desktop-modal"{return Err("history confirmation missing".into())}
 let at=chrono::DateTime::parse_from_rfc3339(result["userConfirmation"]["at"].as_str().unwrap_or("")).map_err(|_|"invalid confirmation time")?.timestamp();
 if at>now+1{return Err("history confirmation time is in the future".into())}
 let raw:String=c.query_row("SELECT m.result FROM cli_operation_meta m JOIN direct_capture_requests d USING(scope,id) WHERE m.scope='cli-op:'||?1 AND m.id=?2 AND m.kind='history-preview' AND d.status='saved' AND m.result IS NOT NULL",params![scope,preview],|r|r.get(0)).map_err(|_|"history preview unavailable")?;
 let p:Value=serde_json::from_str(&raw).map_err(|e|e.to_string())?;
 let generated=chrono::DateTime::parse_from_rfc3339(p["generatedAt"].as_str().unwrap_or("")).map_err(|_|"invalid preview time")?.timestamp();
 if generated>at||at-generated>900{return Err("history preview expired".into())}
 let head:i64=c.query_row("SELECT version FROM operation_history_head WHERE scope=?1",[scope],|r|r.get(0)).optional().map_err(|e|e.to_string())?.unwrap_or(0);
 if p["head"]!=head||p["workspaceVersion"]!=format!("{:x}",Sha256::digest(prior.to_string().as_bytes())){return Err("history preview stale".into())}
 for k in ["rows","conflicts","pointsImpact"]{if p[k]!=result[k]{return Err("history receipt differs from preview".into())}}
 let rows=p["rows"].as_array().filter(|r|!r.is_empty()).ok_or("empty preview")?;
 if result["affected"]!=rows.len(){return Err("history affected count mismatch".into())}
 let mut expected=prior.clone();
 let tasks=expected["tasks"].as_array_mut().ok_or("missing tasks")?;
 let mut seen=std::collections::BTreeSet::new();
 for row in rows{
  let id=row["id"].as_str().ok_or("invalid task id")?;
  if !seen.insert(id){return Err("duplicate history row".into())}
  let t=tasks.iter_mut().find(|t|t["id"]==id).and_then(Value::as_object_mut).ok_or("history task missing")?;
  let fields=row["fields"].as_object().filter(|m|!m.is_empty()).ok_or("empty history fields")?;
  for (k,v) in fields{
   if !["title","priority","listId","sectionId","tags","date","time","anchor","duration","deadline","planMinutes","planSegments","deletedAt","status","stage","completedAt"].contains(&k.as_str()){return Err("protected history field".into())}
   let before=&v["before"];let after=&v["after"];
   if before["present"]==true{if t.get(k)!=before.get("value"){return Err("history field changed".into())}}
   else if before["present"]!=false||t.contains_key(k){return Err("history field presence changed".into())}
   if after["present"]==true{t.insert(k.clone(),after.get("value").ok_or("missing history value")?.clone());}
   else if after["present"]==false{t.remove(k);}else{return Err("invalid history field".into())}
  }
 }
 // Activity is produced by the existing shared editor, not supplied by the CLI.
 let strip=|mut v:Value|{if let Some(ts)=v["tasks"].as_array_mut(){for t in ts{if let Some(m)=t.as_object_mut(){m.remove("activity");}}}v};
 if strip(expected)!=strip(next.clone()){return Err("history mutation exceeds preview".into())}
 Ok(())
}
pub(super) type PendingReceipt=(String,String,String,String);
pub(super) enum ReceiptState{Duplicate,Pending(Option<PendingReceipt>)}
pub(super) fn prepare_receipt(tx:&Connection,scope:&str,receipt:Option<&serde_json::Value>)->Result<ReceiptState,String>{
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
   if old==status&&old_result.as_deref()==Some(raw.as_str()){return Ok(ReceiptState::Duplicate)}
   return Err("operation already finalized".into())
  }
  if kind!="create"&&!cli::advanced_scope(&tx,scope)?{return Err("advanced CLI access not authorized".into())}
  Some((queue_scope,id.to_owned(),status.to_owned(),raw))
 }else{None};
 Ok(ReceiptState::Pending(op))
}
pub(super) fn history_request(tx:&Connection,scope:&str,body:&str,op:&Option<PendingReceipt>)->Result<Option<(String,String,String)>,String>{
 let mut info:Option<(String,String,String)>=None;
 if let Some((queue,id,status,_))=op{
  if status=="saved"{
   let (kind,text):(String,String)=tx.query_row("SELECT m.kind,d.text FROM cli_operation_meta m JOIN direct_capture_requests d USING(scope,id) WHERE m.scope=?1 AND m.id=?2",params![queue,id],|r|Ok((r.get(0)?,r.get(1)?))).map_err(|e|e.to_string())?;
   let group=serde_json::from_str::<serde_json::Value>(&text).ok().and_then(|v|v["operationGroup"].as_str().filter(|g|uuid::Uuid::parse_str(g).is_ok()).map(str::to_owned)).unwrap_or_else(||id.clone());
   info=Some((id.clone(),kind,group));
  }
 }else{
  let capture:Option<String>=tx.query_row("SELECT d.id FROM direct_capture_requests d JOIN cli_capture_meta m USING(scope,id) WHERE d.scope='cli:'||?1 AND d.status='pending' AND m.task_count=(SELECT count(DISTINCT json_extract(t.value,'$.id')) FROM json_each(?2,'$.tasks') t WHERE json_extract(t.value,'$.id') IN (SELECT d.id||':'||n FROM (WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n<50) SELECT n FROM seq) WHERE n<=m.task_count))",params![scope,body],|r|r.get(0)).optional().map_err(|e|e.to_string())?;
  if let Some(id)=capture{info=Some((id.clone(),"batch-capture".into(),id))}
 }
 Ok(info)
}
pub(super) fn finish_captures(tx:&Connection,scope:&str,body:&str)->Result<(),String>{
 tx.execute("UPDATE direct_capture_requests SET status='saved',text='' WHERE scope=?1 AND status='pending' AND NOT EXISTS(SELECT 1 FROM cli_capture_meta m WHERE m.scope=direct_capture_requests.scope AND m.id=direct_capture_requests.id) AND id IN (SELECT json_extract(value,'$.id') FROM json_each(?2,'$.tasks'))",params![scope,body]).map_err(|e|e.to_string())?;
 // Structured batch receipt is committed only when every deterministic task ID exists.
 tx.execute("UPDATE direct_capture_requests AS d SET status='saved',text='' WHERE d.scope='cli:'||?1 AND d.status='pending' AND EXISTS(SELECT 1 FROM cli_capture_meta m WHERE m.scope=d.scope AND m.id=d.id AND m.task_count=(SELECT count(DISTINCT json_extract(t.value,'$.id')) FROM json_each(?2,'$.tasks') t WHERE json_extract(t.value,'$.id') IN (SELECT d.id||':'||n FROM (WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n<50) SELECT n FROM seq) WHERE n<=m.task_count)))",params![scope,body]).map_err(|e|e.to_string())?;
 Ok(())
}
pub(super) fn finish_receipt(tx:&Connection,op:Option<PendingReceipt>)->Result<(),String>{
 if let Some((queue_scope,id,status,result))=op{
  if tx.execute("UPDATE direct_capture_requests SET status=?3,text='' WHERE scope=?1 AND id=?2 AND status='pending'",params![&queue_scope,&id,&status]).map_err(|e|e.to_string())?!=1{return Err("operation state changed".into())}
  if tx.execute("UPDATE cli_operation_meta SET result=?3 WHERE scope=?1 AND id=?2",params![&queue_scope,&id,&result]).map_err(|e|e.to_string())?!=1{return Err("operation receipt missing".into())}
 }
 Ok(())
}
fn save_with_receipt(c:&mut Connection,scope:&str,body:&str,store:Option<&str>,receipt:Option<&serde_json::Value>)->Result<(),String>{
 if !valid_scope(scope)||body.len()>16_000_000{return Err("无效工作空间或数据过大".into())}
 let state:serde_json::Value=serde_json::from_str(body).map_err(|e|e.to_string())?;
 if state["version"]!=2||!state["tasks"].is_array(){return Err("不支持的工作空间格式".into())}
 let now=Local::now().timestamp();let tx=c.transaction().map_err(|e|e.to_string())?;
 // The operation receipt is local metadata. Validate the pending request and
 // terminal response before modifying any workspace rows. A retry of the
 // identical already-committed receipt cannot overwrite a newer snapshot.
 let op=match prepare_receipt(&tx,scope,receipt)?{ReceiptState::Duplicate=>return Ok(()),ReceiptState::Pending(op)=>op};
 let prior:Option<String>=tx.query_row("SELECT body FROM snapshots WHERE scope=?1",[scope],|r|r.get(0)).optional().map_err(|e|e.to_string())?;
 let mut prior_state=None;
 if let Some((queue,id,status,_))=&op{
  let kind:String=tx.query_row("SELECT kind FROM cli_operation_meta WHERE scope=?1 AND id=?2",params![queue,id],|r|r.get(0)).map_err(|e|e.to_string())?;
  if kind=="history-apply"&&status=="saved"{
   let old=serde_json::from_str(prior.as_deref().ok_or("missing prior snapshot")?).map_err(|e|e.to_string())?;
   validate_history_commit(&tx,scope,id,&old,&state,&receipt.unwrap()["result"],now)?;prior_state=Some(old);
  }
 }
 if prior.as_deref()!=Some(body){
 tx.execute("INSERT OR IGNORE INTO backups SELECT scope,body,?2 FROM snapshots WHERE scope=?1 AND NOT EXISTS(SELECT 1 FROM backups WHERE scope=?1 AND saved_at>?2-3600)",params![scope,now]).map_err(|e|e.to_string())?;
 tx.execute("DELETE FROM backups WHERE scope=?1 AND saved_at NOT IN (SELECT saved_at FROM backups WHERE scope=?1 ORDER BY saved_at DESC LIMIT 24)",[scope]).map_err(|e|e.to_string())?;
 tx.execute("INSERT INTO snapshots VALUES(?1,?2,?3) ON CONFLICT(scope) DO UPDATE SET body=excluded.body,updated_at=excluded.updated_at",params![scope,body,now]).map_err(|e|e.to_string())?;
 let prior_state=prior_state.or_else(||prior.as_ref().and_then(|x|serde_json::from_str::<serde_json::Value>(x).ok()));
 update_index(&tx,scope,prior_state.as_ref(),&state).map_err(|e|e.to_string())?;
 // Identify the actual pending request rather than trust model-supplied source.
 let info=history_request(&tx,scope,body,&op)?;
 operation_history::append_history_with_raw(&tx,scope,prior_state.as_ref(),&state,now,info.as_ref().map(|(id,k,g)|(id.as_str(),k.as_str(),g.as_str(),receipt.and_then(|r|r["result"].get("userConfirmation")))),prior.as_deref().map(|p|(p,body)))?;

 }
 // Mark receipt atomically with snapshot, never infer success from frontend memory.
 finish_captures(&tx,scope,body)?;
 #[cfg(test)]
 let shadow_prior_store:Option<String>=if super::incremental_shadow::active(){tx.query_row("SELECT body FROM workspace_store WHERE scope=?1",[scope],|r|r.get(0)).optional().map_err(|e|e.to_string())?}else{None};
 if let Some(store)=store{tx.execute("INSERT INTO workspace_store VALUES(?1,?2) ON CONFLICT(scope) DO UPDATE SET body=excluded.body WHERE workspace_store.body<>excluded.body",params![scope,store]).map_err(|e|e.to_string())?;}
 finish_receipt(&tx,op)?;
 #[cfg(test)]
 super::incremental_shadow::before_commit(&tx,scope,body,store,prior.as_deref(),shadow_prior_store.as_deref())?;
 #[cfg(test)]
 if let Ok(marker)=std::env::var("TODO_TEST_HISTORY_PRECOMMIT_MARKER"){
  // Force dirty SQLite pages into the WAL before the parent kills this test process.
  tx.cache_flush().map_err(|e|e.to_string())?;
  std::fs::write(marker,b"precommit").map_err(|e|e.to_string())?;
  loop{std::thread::park();}
 }
 tx.commit().map_err(|e|e.to_string())
}
fn index_values(state:&serde_json::Value)->std::collections::BTreeMap<&str,(&str,&str)>{
 let mut out=std::collections::BTreeMap::new();
 if let Some(tasks)=state["tasks"].as_array(){for t in tasks{if t["deletedAt"].is_null(){if let Some(id)=t["id"].as_str(){out.insert(id,(t["title"].as_str().unwrap_or(""),t["notes"].as_str().unwrap_or("")));}}}}
 out
}
pub(super) fn update_index(c:&Connection,scope:&str,prior:Option<&serde_json::Value>,state:&serde_json::Value)->rusqlite::Result<()>{
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

#[cfg(test)]
mod performance_tests{
 use super::*;
 #[test]#[ignore]fn profile_storage_phases(){
  use std::time::Instant;
  let dir=std::env::temp_dir().join(format!("todo-phase-{}",uuid::Uuid::new_v4()));std::fs::create_dir(&dir).unwrap();
  let mut c=Connection::open(dir.join("phase.sqlite3")).unwrap();schema(&c).unwrap();
  let a=serde_json::json!({"version":2,"tasks":(0..10000).map(|i|serde_json::json!({"id":format!("qa-{i}"),"title":format!("synthetic task {i}"),"notes":"synthetic","priority":0,"activity":(0..5).map(|j|serde_json::json!({"id":format!("qa-{i}-{j}"),"kind":"priority","category":"property","operation":format!("op-{j}"),"changes":[{"field":"priority","before":"0","after":"1"}]})).collect::<Vec<_>>() })).collect::<Vec<_>>()});
  let raw=a.to_string();save(&mut c,"guest",&raw).unwrap();
  let mut b=a.clone();b["tasks"][0]["priority"]=serde_json::json!(3);save(&mut c,"guest",&b.to_string()).unwrap();
  let before=b.to_string();b["tasks"][1]["priority"]=serde_json::json!(3);let after=b.to_string();
  for _ in 0..5{
   let t=Instant::now();let a:serde_json::Value=serde_json::from_str(&before).unwrap();let b:serde_json::Value=serde_json::from_str(&after).unwrap();let parse=t.elapsed().as_secs_f64()*1000.;
   let tx=c.transaction().unwrap();
   let t=Instant::now();update_index(&tx,"guest",Some(&a),&b).unwrap();let index=t.elapsed().as_secs_f64()*1000.;
   let t=Instant::now();operation_history::append_history_with_raw(&tx,"guest",Some(&a),&b,Local::now().timestamp(),None,Some((&before,&after))).unwrap();let journal=t.elapsed().as_secs_f64()*1000.;
   let t=Instant::now();tx.execute("UPDATE snapshots SET body=?1 WHERE scope='guest'",[&after]).unwrap();let snapshot=t.elapsed().as_secs_f64()*1000.;
   tx.rollback().unwrap();
   println!("phase parse_two_ms={parse:.3} index_ms={index:.3} journal_with_hash_ms={journal:.3} snapshot_sql_ms={snapshot:.3} (rolled back, excludes commit)");
  }
  drop(c);std::fs::remove_dir_all(dir).unwrap();
 }
}
