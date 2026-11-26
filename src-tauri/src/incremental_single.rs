// R3 isolated single-authority experiment. No production entrypoint.
// Full canonical reconstruction is deliberately retained for the official
// history/confirmation contract; persistent writes are row-level only.
use super::*;
use serde_json::{Value,json};
use sha2::{Digest,Sha256};
use std::collections::{BTreeMap,BTreeSet};
type R<T>=Result<T,String>;
const KEY:&str="todo-workbench-v1";
const KEYS:&[&str]=&["todo-workbench-backup","todo-workbench-backup-at","todo-workbench-backup-corrupt","todo-cloud-meta","todo-cloud-base","todo-conflict-backup","todo-field-merge-backup","todo-native-migration-backup"];
fn err(e:rusqlite::Error)->String{e.to_string()}
fn sha(s:&str)->String{format!("{:x}",Sha256::digest(s.as_bytes()))}
fn parse(s:&str)->R<Value>{serde_json::from_str(s).map_err(|e|e.to_string())}
fn allowed(s:&str)->R<()>{if s=="guest"||s=="00000000-0000-4000-8000-000000000001"{Ok(())}else{Err("isolated scope only".into())}}
fn meta(v:&Value)->R<Value>{let mut m=v.as_object().ok_or("invalid state")?.clone();m.remove("tasks");Ok(Value::Object(m))}
fn tasks(v:&Value)->R<BTreeMap<&str,&Value>>{
 if v["version"]!=2{return Err("state version".into())}
 let mut out=BTreeMap::new();for t in v["tasks"].as_array().ok_or("tasks")?{
  let id=t["id"].as_str().filter(|x|!x.is_empty()&&x.len()<=200).ok_or("task id")?;
  if out.insert(id,t).is_some(){return Err("duplicate task".into())}
 }Ok(out)
}
fn keys(v:&Value)->R<Value>{
 let mut m=v.as_object().ok_or("store")?.clone();m.remove(KEY);
 let v=Value::Object(m);validate_keys(&v)?;Ok(v)
}
fn validate_keys(v:&Value)->R<()>{
 if v.as_object().ok_or("keys")?.iter().any(|(k,v)|!KEYS.contains(&k.as_str())||!v.is_string()){return Err("invalid store keys".into())}Ok(())
}
pub(super) fn wrap(v:&Value,k:&Value)->Value{let mut out=k.clone();out[KEY]=json!(v.to_string());out}
pub(super) fn schema(c:&Connection)->R<()>{
 super::storage::schema(c).map_err(err)?;
 c.execute_batch("CREATE TABLE r3_head(scope TEXT PRIMARY KEY,rev INTEGER NOT NULL,body_hash TEXT NOT NULL,kv_hash TEXT NOT NULL,layout_hash TEXT NOT NULL);
 CREATE TABLE r3_task(scope TEXT NOT NULL,id TEXT NOT NULL,pos INTEGER NOT NULL,body TEXT NOT NULL,hash TEXT NOT NULL,PRIMARY KEY(scope,id)) WITHOUT ROWID;
 CREATE INDEX r3_order ON r3_task(scope,pos);
 CREATE TABLE r3_meta(scope TEXT PRIMARY KEY,body TEXT NOT NULL);
 CREATE TABLE r3_kv(scope TEXT NOT NULL,key TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(scope,key)) WITHOUT ROWID;
 CREATE TABLE r3_retired(scope TEXT PRIMARY KEY);
 CREATE TABLE r3_ack(scope TEXT NOT NULL,id TEXT NOT NULL,digest TEXT NOT NULL,rev INTEGER NOT NULL,body_hash TEXT NOT NULL,PRIMARY KEY(scope,id)) WITHOUT ROWID;
 CREATE TRIGGER r3_old_snapshot_insert BEFORE INSERT ON snapshots WHEN EXISTS(SELECT 1 FROM r3_head WHERE scope=NEW.scope) BEGIN SELECT RAISE(ABORT,'R3 requires explicit export'); END;
 CREATE TRIGGER r3_old_snapshot_update BEFORE UPDATE ON snapshots WHEN EXISTS(SELECT 1 FROM r3_head WHERE scope=OLD.scope OR scope=NEW.scope) BEGIN SELECT RAISE(ABORT,'R3 requires explicit export'); END;
 CREATE TRIGGER r3_old_store_insert BEFORE INSERT ON workspace_store WHEN EXISTS(SELECT 1 FROM r3_head WHERE scope=NEW.scope) BEGIN SELECT RAISE(ABORT,'R3 requires explicit export'); END;
 CREATE TRIGGER r3_old_store_update BEFORE UPDATE ON workspace_store WHEN EXISTS(SELECT 1 FROM r3_head WHERE scope=OLD.scope OR scope=NEW.scope) BEGIN SELECT RAISE(ABORT,'R3 requires explicit export'); END;").map_err(err)
}
fn head(c:&Connection,s:&str)->R<(i64,String,String)>{
 allowed(s)?;c.query_row("SELECT rev,body_hash,kv_hash FROM r3_head WHERE scope=?1",[s],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).map_err(err)
}
fn write_task(c:&Connection,s:&str,t:&Value,pos:i64)->R<()>{
 let id=t["id"].as_str().ok_or("id")?;let raw=t.to_string();
 c.execute("INSERT INTO r3_task VALUES(?1,?2,?3,?4,?5) ON CONFLICT(scope,id) DO UPDATE SET pos=excluded.pos,body=excluded.body,hash=excluded.hash",params![s,id,pos,&raw,sha(&raw)]).map_err(err)?;Ok(())
}
fn write_keys(c:&Connection,s:&str,old:&Value,new:&Value)->R<()>{
 validate_keys(new)?;
 let old=old.as_object().ok_or("keys")?;
 for k in old.keys(){if new.get(k).is_none(){c.execute("DELETE FROM r3_kv WHERE scope=?1 AND key=?2",params![s,k]).map_err(err)?;}}
 for(k,v)in new.as_object().unwrap(){if old.get(k)!=Some(v){c.execute("INSERT INTO r3_kv VALUES(?1,?2,?3) ON CONFLICT(scope,key) DO UPDATE SET body=excluded.body",params![s,k,v.as_str().unwrap()]).map_err(err)?;}}
 Ok(())
}
struct Current{rev:i64,body:Value,raw:String,keys:Value,hash:String}
struct RawRow{id:String,raw:String,hash:String}
struct RawCurrent{rev:i64,meta:Value,rows:Vec<RawRow>,raw:String,keys:Value,hash:String}
fn layout(rows:&[RawRow])->String{
 let mut h=Sha256::new();h.update(b"r3-layout-v1");
 for r in rows{h.update((r.id.len() as u64).to_be_bytes());h.update(r.id.as_bytes());h.update(r.hash.as_bytes());}
 format!("{:x}",h.finalize())
}
fn state_layout(v:&Value)->R<String>{
 let mut rows=vec![];for t in v["tasks"].as_array().ok_or("tasks")?{let raw=t.to_string();rows.push(RawRow{id:t["id"].as_str().ok_or("id")?.into(),hash:sha(&raw),raw});}Ok(layout(&rows))
}
// Canonical bytes: identical sorted object keys, actual canonical row bodies
// and explicit positions. Avoid parsing unchanged task bodies.
fn assemble(meta:&Value,rows:&[RawRow])->R<String>{
 let m=meta.as_object().ok_or("meta")?;if m.contains_key("tasks"){return Err("meta contains tasks".into())}
 let mut names=m.keys().map(String::as_str).collect::<Vec<_>>();names.push("tasks");names.sort_unstable();
 let mut out=String::with_capacity(rows.iter().map(|r|r.raw.len()+1).sum::<usize>()+256);out.push('{');
 for (i,k)in names.iter().enumerate(){if i!=0{out.push(',')}out.push_str(&json!(k).to_string());out.push(':');
  if *k=="tasks"{out.push('[');for (j,r)in rows.iter().enumerate(){if j!=0{out.push(',')}out.push_str(&r.raw);}out.push(']');}
  else{out.push_str(&m[*k].to_string());}
 }out.push('}');Ok(out)
}
fn read_raw(c:&Connection,s:&str)->R<RawCurrent>{
 let (rev,h,kh)=head(c,s)?;
 let lh:String=c.query_row("SELECT layout_hash FROM r3_head WHERE scope=?1",[s],|r|r.get(0)).map_err(err)?;
 let raw:String=c.query_row("SELECT body FROM r3_meta WHERE scope=?1",[s],|r|r.get(0)).map_err(err)?;
 let m=parse(&raw)?;if m["version"]!=2||m.get("tasks").is_some(){return Err("invalid meta".into())}
 let mut q=c.prepare("SELECT id,pos,body,hash FROM r3_task WHERE scope=?1 ORDER BY pos,id").map_err(err)?;
 let mut cursor=q.query([s]).map_err(err)?;let mut rows=vec![];
 while let Some(r)=cursor.next().map_err(err)?{
  let id:String=r.get(0).map_err(err)?;let pos:i64=r.get(1).map_err(err)?;let raw:String=r.get(2).map_err(err)?;let h:String=r.get(3).map_err(err)?;
  if pos!=rows.len() as i64||sha(&raw)!=h{return Err("row integrity".into())}rows.push(RawRow{id,raw,hash:h});
 }
 if layout(&rows)!=lh{return Err("layout integrity".into())}
 let raw=assemble(&m,&rows)?;if sha(&raw)!=h{return Err("state integrity".into())}
 let mut q=c.prepare("SELECT key,body FROM r3_kv WHERE scope=?1 ORDER BY key").map_err(err)?;
 let kv=q.query_map([s],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?))).map_err(err)?.collect::<Result<BTreeMap<_,_>,_>>().map_err(err)?;
 let k=json!(kv);validate_keys(&k)?;if sha(&k.to_string())!=kh{return Err("key integrity".into())}
 Ok(RawCurrent{rev,meta:m,rows,raw,keys:k,hash:h})
}
fn decoded(v:RawCurrent)->R<Current>{
 let body=parse(&v.raw)?;tasks(&body)?;
 if body.to_string()!=v.raw||body["tasks"].as_array().unwrap().iter().zip(&v.rows).any(|(t,r)|t["id"]!=r.id){return Err("canonical row mismatch".into())}
 Ok(Current{rev:v.rev,body,raw:v.raw,keys:v.keys,hash:v.hash})
}
fn read(c:&Connection,s:&str)->R<Current>{decoded(read_raw(c,s)?)}
fn verify_history_hash(c:&Connection,s:&str,hash:&str)->R<i64>{
 let old:Option<(i64,String)>=c.query_row("SELECT version,fingerprint FROM operation_history_head WHERE scope=?1",[s],|r|Ok((r.get(0)?,r.get(1)?))).optional().map_err(err)?;
 if let Some((v,h))=old{if h!=hash{return Err("history head mismatch".into())}Ok(v)}else{
  let n:i64=c.query_row("SELECT count(*) FROM operation_history WHERE scope=?1",[s],|r|r.get(0)).map_err(err)?;
  if n!=0{return Err("missing history head".into())}Ok(0)
 }
}
fn verify_history(c:&Connection,s:&str,cur:&Current)->R<i64>{verify_history_hash(c,s,&cur.hash)}
pub(super) fn journal(c:&Connection,s:&str)->R<Value>{
 let tx=c.unchecked_transaction().map_err(err)?;let cur=read(&tx,s)?;verify_history(&tx,s,&cur)?;
 let v=super::operation_history::read_row_history(&tx,s,cur.raw)?;tx.commit().map_err(err)?;Ok(v)
}
// Called only on test-created legacy copies. Atomic copy + remove authoritative
// snapshots, preserving existing official journal/index/backups/queue tables.
pub(super) fn migrate(c:&mut Connection,s:&str,expected:&Value,fail:bool)->R<()>{
 allowed(s)?;let tx=c.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate).map_err(err)?;
 let retired:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM r3_ack WHERE scope=?1 UNION ALL SELECT 1 FROM r3_retired WHERE scope=?1)",[s],|r|r.get(0)).map_err(err)?;if retired{return Err("retired R3 session".into())}
 let pending:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM direct_capture_requests WHERE (scope=?1 OR scope='cli:'||?1 OR scope='cli-op:'||?1) AND status='pending')",[s],|r|r.get(0)).map_err(err)?;
 if pending{return Err("pending operation blocks migration".into())}
 let raw:String=tx.query_row("SELECT body FROM snapshots WHERE scope=?1",[s],|r|r.get(0)).map_err(err)?;
 let stored:String=tx.query_row("SELECT body FROM workspace_store WHERE scope=?1",[s],|r|r.get(0)).map_err(err)?;
 let state=parse(&raw)?;let store=parse(&stored)?;let k=keys(&store)?;
 if parse(store[KEY].as_str().ok_or("snapshot")?)?!=state||wrap(&state,&k)!=*expected{return Err("legacy source changed".into())}
 tasks(&state)?;let canonical=state.to_string();
 tx.execute("INSERT INTO r3_meta VALUES(?1,?2)",params![s,meta(&state)?.to_string()]).map_err(err)?;
 for(i,t)in state["tasks"].as_array().unwrap().iter().enumerate(){write_task(&tx,s,t,i as i64)?;}
 write_keys(&tx,s,&json!({}),&k)?;
 tx.execute("INSERT INTO r3_head VALUES(?1,0,?2,?3,?4)",params![s,sha(&canonical),sha(&k.to_string()),state_layout(&state)?]).map_err(err)?;
 let v=read(&tx,s)?;verify_history(&tx,s,&v)?;if v.body!=state||v.keys!=k{return Err("migration mismatch".into())}
 tx.execute("DELETE FROM snapshots WHERE scope=?1",[s]).map_err(err)?;
 tx.execute("DELETE FROM workspace_store WHERE scope=?1",[s]).map_err(err)?;
 if fail{return Err("injected migration failure".into())}
 if let Ok(marker)=std::env::var("TODO_R3_MIGRATION_PRECOMMIT"){tx.cache_flush().map_err(err)?;std::fs::write(marker,b"ready").map_err(|e|e.to_string())?;loop{std::thread::park()}}
 tx.commit().map_err(err)
}
fn exact(v:&Value,required:&[&str])->R<()>{let m=v.as_object().ok_or("object required")?;if m.len()!=required.len()||required.iter().any(|k|!m.contains_key(*k)){return Err("unexpected patch fields".into())}Ok(())}
fn replay(cur:&Current,p:&Value)->R<(Value,Value,BTreeSet<String>)>{
 exact(p,&["put","remove","order","meta","keys"])?;
 let old=tasks(&cur.body)?;let mut map=old.iter().map(|(k,v)|((*k).to_owned(),(*v).clone())).collect::<BTreeMap<_,_>>();
 let mut touched=BTreeSet::new();
 for x in p["remove"].as_array().ok_or("remove")?{
  exact(x,&["id","before"])?;let id=x["id"].as_str().ok_or("remove id")?;
  if !touched.insert(id.to_owned())||map.get(id)!=Some(&x["before"]){return Err("stale remove".into())}map.remove(id);
 }
 for x in p["put"].as_array().ok_or("put")?{
  exact(x,&["id","before","after"])?;let id=x["id"].as_str().ok_or("put id")?;
  if !touched.insert(id.to_owned())||map.get(id).unwrap_or(&Value::Null)!=&x["before"]||x["after"]["id"]!=id{return Err("stale put".into())}
  map.insert(id.to_owned(),x["after"].clone());
 }
 let order=if p["order"].is_null(){cur.body["tasks"].as_array().unwrap().iter().map(|t|t["id"].clone()).collect::<Vec<_>>()}else{p["order"].as_array().ok_or("order")?.clone()};
 let mut ts=vec![];for id in order{ts.push(map.remove(id.as_str().ok_or("order id")?).ok_or("invalid order")?);}if !map.is_empty(){return Err("incomplete order".into())}
 let mut m=meta(&cur.body)?;
 if !p["meta"].is_null(){exact(&p["meta"],&["before","after"])?;if m!=p["meta"]["before"]{return Err("stale meta".into())}m=p["meta"]["after"].clone();if m.get("tasks").is_some(){return Err("meta contains tasks".into())}}
 m.as_object_mut().ok_or("meta")?.insert("tasks".into(),Value::Array(ts));tasks(&m)?;
 let mut k=cur.keys.clone();let mut seen=BTreeSet::new();for x in p["keys"].as_array().ok_or("keys")?{
  exact(x,&["key","before","after"])?;let key=x["key"].as_str().filter(|k|KEYS.contains(k)).ok_or("key")?;
  if !seen.insert(key)||k.get(key).unwrap_or(&Value::Null)!=&x["before"]{return Err("stale key".into())}
  if x["after"].is_null(){k.as_object_mut().unwrap().remove(key);}else{k[key]=x["after"].clone();}
 }
 validate_keys(&k)?;Ok((m,k,touched))
}
pub(super) fn delta(a:&Value,b:&Value,old_keys:&Value,new_keys:&Value)->Value{
 let mut p=super::incremental_patch::patch(a,b);let mut keys=vec![];
 for k in old_keys.as_object().unwrap().keys().chain(new_keys.as_object().unwrap().keys()).collect::<BTreeSet<_>>(){
  if old_keys.get(k)!=new_keys.get(k){keys.push(json!({"key":k,"before":old_keys[k],"after":new_keys[k]}))}
 }p["keys"]=json!(keys);p
}
fn store_budget(raw:&str,k:&Value)->R<()>{
 let bytes=k.to_string().len()+if k.as_object().unwrap().is_empty(){0}else{1}+json!(KEY).to_string().len()+1+json!(raw).to_string().len();
 if raw.len()>16_000_000||bytes>64_000_000{return Err("store budget".into())}Ok(())
}
fn backup(c:&Connection,s:&str,raw:&str,now:i64)->R<()>{
 c.execute("INSERT OR IGNORE INTO backups SELECT ?1,?2,?3 WHERE NOT EXISTS(SELECT 1 FROM backups WHERE scope=?1 AND saved_at>?3-3600)",params![s,raw,now]).map_err(err)?;
 c.execute("DELETE FROM backups WHERE scope=?1 AND saved_at NOT IN (SELECT saved_at FROM backups WHERE scope=?1 ORDER BY saved_at DESC LIMIT 24)",[s]).map_err(err)?;Ok(())
}
fn finalize(tx:rusqlite::Transaction<'_>,s:&str,rid:&str,digest:&str,base:i64,raw:&str,next_hash:&str,k:&Value,lh:&str,op:Option<super::storage::PendingReceipt>,fail:bool)->R<(i64,String)>{
 super::storage::finish_captures(&tx,s,raw)?;
 super::storage::finish_receipt(&tx,op)?;
 let rev=base.checked_add(1).ok_or("revision overflow")?;
 tx.execute("UPDATE r3_head SET rev=?2,body_hash=?3,kv_hash=?4,layout_hash=?5 WHERE scope=?1",params![s,rev,next_hash,sha(&k.to_string()),lh]).map_err(err)?;
 tx.execute("INSERT INTO r3_ack VALUES(?1,?2,?3,?4,?5)",params![s,rid,digest,rev,next_hash]).map_err(err)?;
 if fail{return Err("injected failure".into())}
 if let Ok(marker)=std::env::var("TODO_R3_PRECOMMIT"){tx.cache_flush().map_err(err)?;std::fs::write(marker,b"ready").map_err(|e|e.to_string())?;loop{std::thread::park()}}
 tx.commit().map_err(err)?;Ok((rev,next_hash.to_owned()))
}
// Restricted existing-row edit path. All untouched bytes and row layout
// are checked against the authoritative manifest. History apply and complex
// operations intentionally take the full reconstruction path.
fn fast_eligible(p:&Value,kind:Option<&str>)->bool{
 kind!=Some("history-apply")&&p["order"].is_null()&&p["meta"].is_null()&&p["keys"].as_array().is_some_and(|x|x.is_empty())&&p["remove"].as_array().is_some_and(|x|x.is_empty())&&p["put"].as_array().is_some_and(|x|x.len()<=100&&x.iter().all(|r|!r["before"].is_null()))
}
fn fast_commit(tx:rusqlite::Transaction<'_>,s:&str,rid:&str,digest:&str,mut cur:RawCurrent,p:&Value,version:i64,op:Option<super::storage::PendingReceipt>,receipt:Option<&Value>,fail:bool)->R<(i64,String)>{
 exact(p,&["put","remove","order","meta","keys"])?;
 let mut changes=BTreeMap::new();
 for x in p["put"].as_array().ok_or("put")?{
  exact(x,&["id","before","after"])?;let id=x["id"].as_str().ok_or("id")?;
  if x["before"]["id"]!=id||x["after"]["id"]!=id||changes.insert(id,(&x["before"],&x["after"])).is_some(){return Err("invalid put".into())}
 }
 let mut found=0;
 for (pos,r)in cur.rows.iter_mut().enumerate(){
  if let Some((a,b))=changes.get(r.id.as_str()){
   found+=1;if a.to_string()!=r.raw{return Err("stale put".into())}
   if a!=b{r.raw=b.to_string();r.hash=sha(&r.raw);write_task(&tx,s,b,pos as i64)?;}
  }
 }
 if found!=changes.len(){return Err("missing task".into())}
 let raw=assemble(&cur.meta,&cur.rows)?;let next_hash=sha(&raw);store_budget(&raw,&cur.keys)?;
 if raw!=cur.raw{
  if op.as_ref().is_some_and(|o|o.2=="cancelled"){return Err("cancelled mutation".into())}
  let now=Local::now().timestamp();backup(&tx,s,&cur.raw,now)?;
  let rows=super::operation_history::history_rows(changes.iter().map(|(id,(a,b))|(*id,Some(*a),Some(*b))));
  let info=super::storage::history_request(&tx,s,&raw,&op)?;
  super::operation_history::write_history_rows(&tx,s,version,rows,vec![],now,info.as_ref().map(|(id,k,g)|(id.as_str(),k.as_str(),g.as_str(),receipt.and_then(|r|r["result"].get("userConfirmation")))),next_hash.clone(),Some(&raw))?;
  let before=json!({"tasks":changes.values().map(|(a,_)|*a).collect::<Vec<_>>()});let after=json!({"tasks":changes.values().map(|(_,b)|*b).collect::<Vec<_>>()});
  super::storage::update_index(&tx,s,Some(&before),&after).map_err(err)?;
 }
 let lh=layout(&cur.rows);finalize(tx,s,rid,digest,cur.rev,&raw,&next_hash,&cur.keys,&lh,op,fail)
}
pub(super) fn commit(c:&mut Connection,s:&str,rid:&str,base:i64,p:&Value,receipt:Option<&Value>,fail:bool)->R<(i64,String)>{
 allowed(s)?;let full=p["kind"]=="snapshot";
 if uuid::Uuid::parse_str(rid).is_err()||p.to_string().len()>if full{64_000_000}else{900000}{return Err("invalid request or delta budget".into())}
 let digest=sha(&json!([base,p,receipt]).to_string());
 let tx=c.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate).map_err(err)?;
 let saved:Option<(String,i64,String)>=tx.query_row("SELECT digest,rev,body_hash FROM r3_ack WHERE scope=?1 AND id=?2",params![s,rid],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).optional().map_err(err)?;
 if let Some((d,rev,h))=saved{return if d==digest{Ok((rev,h))}else{Err("request collision".into())}}
 let cur=read_raw(&tx,s)?;if cur.rev!=base{return Err("stale base".into())}
 let version=verify_history_hash(&tx,s,&cur.hash)?;
 let op=match super::storage::prepare_receipt(&tx,s,receipt)?{super::storage::ReceiptState::Duplicate=>return Err("finalized receipt; reload authority".into()),super::storage::ReceiptState::Pending(op)=>op};
 let kind:Option<String>=if let Some((queue,id,_,_))=&op{Some(tx.query_row("SELECT kind FROM cli_operation_meta WHERE scope=?1 AND id=?2",params![queue,id],|r|r.get(0)).map_err(err)?)}else{None};
 if !full&&fast_eligible(p,kind.as_deref()){return fast_commit(tx,s,rid,&digest,cur,p,version,op,receipt,fail)}
 let cur=decoded(cur)?;
 let full_patch;
 let p=if full{
  exact(p,&["kind","store"])?;let store=&p["store"];let next=parse(store[KEY].as_str().ok_or("snapshot body")?)?;tasks(&next)?;
  full_patch=delta(&cur.body,&next,&cur.keys,&keys(store)?);&full_patch
 }else{p};
 let (next,k,touched)=replay(&cur,p)?;let raw=next.to_string();let next_hash=sha(&raw);
 store_budget(&raw,&k)?;
 if let Some((_,id,status,_))=&op{
  if status=="cancelled"&&(cur.body!=next||cur.keys!=k){return Err("cancelled mutation".into())}
  if kind.as_deref()==Some("history-apply")&&status=="saved"{super::storage::validate_history_commit(&tx,s,id,&cur.body,&next,&receipt.unwrap()["result"],Local::now().timestamp())?;}
 }
 let now=Local::now().timestamp();
 if cur.body!=next{
  backup(&tx,s,&cur.raw,now)?;
  let old=tasks(&cur.body)?;let new=tasks(&next)?;
  let rows=super::operation_history::history_rows(touched.iter().map(|id|(id.as_str(),old.get(id.as_str()).copied(),new.get(id.as_str()).copied())));
  let a=meta(&cur.body)?;let b=meta(&next)?;
  let other=a.as_object().unwrap().keys().chain(b.as_object().unwrap().keys()).collect::<BTreeSet<_>>().into_iter().filter(|key|a.get(*key)!=b.get(*key)).collect::<Vec<_>>();
  let info=super::storage::history_request(&tx,s,&raw,&op)?;
  super::operation_history::write_history_rows(&tx,s,version,rows,other,now,info.as_ref().map(|(id,k,g)|(id.as_str(),k.as_str(),g.as_str(),receipt.and_then(|r|r["result"].get("userConfirmation")))),next_hash.clone(),Some(&raw))?;
  if touched.len()<=100{
   let small=|m:&BTreeMap<&str,&Value>|json!({"tasks":touched.iter().filter_map(|id|m.get(id.as_str()).copied()).collect::<Vec<_>>()});
   super::storage::update_index(&tx,s,Some(&small(&old)),&small(&new)).map_err(err)?;
  }else{super::storage::update_index(&tx,s,Some(&cur.body),&next).map_err(err)?;}
  for id in &touched{if !new.contains_key(id.as_str()){tx.execute("DELETE FROM r3_task WHERE scope=?1 AND id=?2",params![s,id]).map_err(err)?;}}
  for(i,t)in next["tasks"].as_array().unwrap().iter().enumerate(){
   let id=t["id"].as_str().unwrap();
   if touched.contains(id){write_task(&tx,s,t,i as i64)?;}
   else if !p["order"].is_null(){tx.execute("UPDATE r3_task SET pos=?3 WHERE scope=?1 AND id=?2 AND pos<>?3",params![s,id,i as i64]).map_err(err)?;}
  }
  if a!=b{tx.execute("UPDATE r3_meta SET body=?2 WHERE scope=?1",params![s,b.to_string()]).map_err(err)?;}
 }
 write_keys(&tx,s,&cur.keys,&k)?;
 let lh=state_layout(&next)?;
 finalize(tx,s,rid,&digest,base,&raw,&next_hash,&k,&lh,op,fail)
}
pub(super) fn export(c:&Connection,s:&str)->R<Value>{
 let tx=c.unchecked_transaction().map_err(err)?;let cur=read(&tx,s)?;verify_history(&tx,s,&cur)?;let out=wrap(&cur.body,&cur.keys);tx.commit().map_err(err)?;Ok(out)
}
// Safe downgrade is a new file, never an overwrite of either authority.
// Existing official history, backup, FTS and receipt tables are preserved.
pub(super) fn export_legacy_copy(c:&Connection,path:&std::path::Path,expected:&BTreeMap<String,i64>)->R<()>{
 if path.exists(){return Err("destination exists".into())}
 c.execute("VACUUM INTO ?1",[path.to_str().ok_or("path")?]).map_err(err)?;
 let mut copy=Connection::open(path).map_err(err)?;
 let tx=copy.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate).map_err(err)?;
 let actual={let mut q=tx.prepare("SELECT scope,rev FROM r3_head ORDER BY scope").map_err(err)?;
  q.query_map([],|r|Ok((r.get::<_,String>(0)?,r.get::<_,i64>(1)?))).map_err(err)?.collect::<Result<BTreeMap<_,_>,_>>().map_err(err)?};
 if &actual!=expected||actual.is_empty(){return Err("export revision/scope changed".into())}
 for s in actual.keys(){
  let v=read(&tx,s)?;verify_history(&tx,s,&v)?;
  let pending:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM direct_capture_requests WHERE (scope=?1 OR scope='cli:'||?1 OR scope='cli-op:'||?1) AND status='pending')",[s],|r|r.get(0)).map_err(err)?;
  if pending{return Err("pending operation blocks export".into())}
  tx.execute("DELETE FROM r3_head WHERE scope=?1",[s]).map_err(err)?;
  tx.execute("INSERT INTO snapshots VALUES(?1,?2,?3)",params![s,&v.raw,Local::now().timestamp()]).map_err(err)?;
  tx.execute("INSERT INTO workspace_store VALUES(?1,?2)",params![s,wrap(&v.body,&v.keys).to_string()]).map_err(err)?;
  for table in ["r3_task","r3_meta","r3_kv"]{tx.execute(&format!("DELETE FROM {table} WHERE scope=?1"),[s]).map_err(err)?;}
  tx.execute("INSERT INTO r3_retired VALUES(?1)",[s]).map_err(err)?;
 }
 tx.commit().map_err(err)?;
 for s in actual.keys(){let j=super::operation_history::history_read(&copy,s,true,300)?;if j["intact"]!=true{return Err("export history not intact".into())}}
 Ok(())
}
pub(super) fn revision(c:&Connection,s:&str)->R<i64>{Ok(head(c,s)?.0)}
pub(super) fn init(c:&mut Connection,s:&str,store:&Value)->R<()>{
 schema(c)?;super::storage::persist_store(c,s,&store.to_string())
}
pub(super) fn compare(c:&Connection,oracle:&Connection,s:&str){
 let store:String=oracle.query_row("SELECT body FROM workspace_store WHERE scope=?1",[s],|r|r.get(0)).unwrap();
 let expected=parse(&store).unwrap();let state=parse(expected[KEY].as_str().unwrap()).unwrap();assert_eq!(export(c,s).unwrap(),wrap(&state,&keys(&expected).unwrap()));
 for sql in ["SELECT json_array(version,source,kind,request_id,group_id,body) FROM operation_history WHERE scope=?1 ORDER BY version","SELECT json_array(task_id,title,notes) FROM task_search WHERE scope=?1 ORDER BY task_id","SELECT body FROM backups WHERE scope=?1 ORDER BY saved_at"]{
  let rows=|c:&Connection|{let mut q=c.prepare(sql).unwrap();q.query_map([s],|r|r.get::<_,String>(0)).unwrap().collect::<Result<Vec<_>,_>>().unwrap()};
  assert_eq!(rows(c),rows(oracle),"{sql}");
 }
 let h=|c:&Connection|c.query_row("SELECT version,fingerprint FROM operation_history_head WHERE scope=?1",[s],|r|Ok((r.get::<_,i64>(0)?,r.get::<_,String>(1)?))).optional().unwrap();
 assert_eq!(h(c),h(oracle));assert_eq!(journal(c,s).unwrap()["intact"],true);
 for table in ["snapshots","workspace_store"]{assert_eq!(c.query_row(&format!("SELECT count(*) FROM {table} WHERE scope=?1"),[s],|r|r.get::<_,i64>(0)).unwrap(),0);}
}
fn id()->String{uuid::Uuid::new_v4().to_string()}
#[test]fn row_authority_shared_editor(){
 let Ok(path)=std::env::var("TODO_R3_FIXTURES")else{return};
 let f=parse(&std::fs::read_to_string(path).unwrap()).unwrap();
 let k=json!({"todo-cloud-meta":"synthetic"});let mut c=Connection::open_in_memory().unwrap();let mut oracle=Connection::open_in_memory().unwrap();
 let mut prior=f["base"].clone();let store=wrap(&prior,&k);init(&mut c,"guest",&store).unwrap();super::storage::schema(&oracle).unwrap();super::storage::persist_store(&mut oracle,"guest",&store.to_string()).unwrap();
 assert!(migrate(&mut c,"guest",&store,true).is_err());assert_eq!(c.query_row("SELECT count(*) FROM r3_task",[],|r|r.get::<_,i64>(0)).unwrap(),0);
 migrate(&mut c,"guest",&store,false).unwrap();compare(&c,&oracle,"guest");
 assert!(super::storage::persist_store(&mut c,"guest",&store.to_string()).is_err());
 for(i,step)in f["steps"].as_array().unwrap().iter().enumerate(){
  let next=&step["state"];let mut p=step["patch"].clone();p["keys"]=json!([]);let rid=id();
  if i==0{assert!(commit(&mut c,"guest",&rid,i as i64,&p,None,true).is_err());compare(&c,&oracle,"guest");}
  let ack=commit(&mut c,"guest",&rid,i as i64,&p,None,false).unwrap();assert_eq!(commit(&mut c,"guest",&rid,i as i64,&p,None,false).unwrap(),ack);
  assert!(commit(&mut c,"guest",&id(),i as i64,&p,None,false).is_err());
  super::storage::persist_store(&mut oracle,"guest",&wrap(next,&k).to_string()).unwrap();compare(&c,&oracle,"guest");prior=next.clone();
 }
 let mut next_keys=k.clone();next_keys["todo-cloud-base"]=json!("synthetic base");let rev=head(&c,"guest").unwrap().0;
 let p=delta(&prior,&prior,&k,&next_keys);commit(&mut c,"guest",&id(),rev,&p,None,false).unwrap();
 super::storage::persist_store(&mut oracle,"guest",&wrap(&prior,&next_keys).to_string()).unwrap();compare(&c,&oracle,"guest");
 // Explicit snapshot fallback is bound to the same revision and all guards.
 let mut n=prior.clone();n["theme"]=json!("light");let rev=head(&c,"guest").unwrap().0;
 let full=json!({"kind":"snapshot","store":wrap(&n,&next_keys)});
 commit(&mut c,"guest",&id(),rev,&full,None,false).unwrap();
 super::storage::persist_store(&mut oracle,"guest",&wrap(&n,&next_keys).to_string()).unwrap();compare(&c,&oracle,"guest");
 assert!(commit(&mut c,"guest",&id(),rev,&full,None,false).is_err());
 c.execute("UPDATE r3_kv SET body='corrupt' WHERE key='todo-cloud-meta'",[]).unwrap();assert!(export(&c,"guest").is_err());
 println!("R3 actual editor steps={} + key-only commit; no current snapshots",f["steps"].as_array().unwrap().len());
}


#[test]fn fast_path_rejects_layout_and_body_corruption(){
 let a=json!({"version":2,"tasks":[{"id":"a","title":"synthetic a","priority":0},{"id":"b","title":"synthetic b","priority":0}]});
 let mut b=a.clone();b["tasks"][0]["priority"]=json!(3);let k=json!({"todo-cloud-meta":"synthetic"});let store=wrap(&a,&k);let p=delta(&a,&b,&k,&k);
 for sql in ["UPDATE r3_task SET id='alien' WHERE id='b'","UPDATE r3_task SET pos=9 WHERE id='b'","UPDATE r3_task SET body='{}' WHERE id='b'","UPDATE r3_head SET body_hash='bad'","UPDATE r3_kv SET body='changed'"]{
  let mut c=Connection::open_in_memory().unwrap();init(&mut c,"guest",&store).unwrap();migrate(&mut c,"guest",&store,false).unwrap();
  c.execute(sql,[]).unwrap();assert!(commit(&mut c,"guest",&id(),0,&p,None,false).is_err(),"{sql}");
  assert!(export(&c,"guest").is_err());assert_eq!(c.query_row("SELECT rev FROM r3_head",[],|r|r.get::<_,i64>(0)).unwrap(),0);
  assert_eq!(c.query_row("SELECT count(*) FROM r3_ack",[],|r|r.get::<_,i64>(0)).unwrap(),0);
 }
 // Omitted/unexpected fields and stale task values cannot be accepted.
 let mut c=Connection::open_in_memory().unwrap();init(&mut c,"guest",&store).unwrap();migrate(&mut c,"guest",&store,false).unwrap();
 let mut invalid=p.clone();invalid["put"][0]["before"]["priority"]=json!(2);assert!(commit(&mut c,"guest",&id(),0,&invalid,None,false).is_err());
 let mut invalid=p.clone();invalid["untrusted"]=json!(true);assert!(commit(&mut c,"guest",&id(),0,&invalid,None,false).is_err());
 assert_eq!(export(&c,"guest").unwrap(),store);
}

#[test]#[ignore]fn single_retention_checkpoint_restart(){
 use std::time::Instant;
 let dir=std::env::temp_dir().join(format!("todo-r3-retention-{}",uuid::Uuid::new_v4()));std::fs::create_dir(&dir).unwrap();let path=dir.join("r3.sqlite3");
 let mut c=Connection::open(&path).unwrap();let mut oracle=Connection::open_in_memory().unwrap();super::storage::schema(&oracle).unwrap();
 let mut state=json!({"version":2,"tasks":(0..1000).map(|i|json!({"id":format!("qa-{i}"),"title":format!("synthetic {i}"),"priority":0,"activity":[]})).collect::<Vec<_>>()});
 let k=json!({"todo-cloud-meta":"synthetic"});let store=wrap(&state,&k);
 init(&mut c,"guest",&store).unwrap();super::storage::persist_store(&mut oracle,"guest",&store.to_string()).unwrap();migrate(&mut c,"guest",&store,false).unwrap();
 let mut ms=vec![];
 for i in 0..320{
  let before=state["tasks"][i].clone();state["tasks"][i]["priority"]=json!(3);
  let p=json!({"put":[{"id":before["id"],"before":before,"after":state["tasks"][i]}],"remove":[],"order":null,"meta":null,"keys":[]});
  let t=Instant::now();commit(&mut c,"guest",&id(),i as i64,&p,None,false).unwrap();ms.push(t.elapsed().as_secs_f64()*1000.);
  super::storage::persist_store(&mut oracle,"guest",&wrap(&state,&k).to_string()).unwrap();
  if i%40==39{
   compare(&c,&oracle,"guest");let wal=std::fs::metadata(dir.join("r3.sqlite3-wal")).map(|m|m.len()).unwrap_or(0);
   c.execute_batch("PRAGMA wal_checkpoint(TRUNCATE)").unwrap();drop(c);c=Connection::open(&path).unwrap();compare(&c,&oracle,"guest");
   println!("R3 checkpoint edits={} wal_before={} revision={}",i+1,wal,revision(&c,"guest").unwrap());
  }
 }
 assert_eq!(c.query_row("SELECT count(*) FROM operation_history WHERE scope='guest'",[],|r|r.get::<_,i64>(0)).unwrap(),300);
 assert_eq!(c.query_row("SELECT count(*) FROM r3_ack WHERE scope='guest'",[],|r|r.get::<_,i64>(0)).unwrap(),320);
 c.execute("VACUUM INTO ?1",[dir.join("backup.sqlite3").to_str().unwrap()]).unwrap();
 let copy=Connection::open(dir.join("backup.sqlite3")).unwrap();compare(&copy,&oracle,"guest");assert_eq!(copy.query_row("PRAGMA integrity_check",[],|r|r.get::<_,String>(0)).unwrap(),"ok");
 ms.sort_by(|a,b|a.total_cmp(b));println!("R3 retention samples=320 p50_ms={:.3} p95_ms={:.3} max_ms={:.3} history=300 transport_acks=320 restarts=8 backup=ok",(ms[159]+ms[160])/2.,ms[303],ms[319]);
 drop((c,copy,oracle));std::fs::remove_dir_all(dir).unwrap();
}
