// Test-only isolated research. No IPC, CLI or application database access.
use super::*;
use serde_json::{Value,json};
use sha2::{Sha256,Digest};
use std::collections::{BTreeMap,BTreeSet};
use std::time::Instant;
type R<T>=Result<T,String>;
const S:&str="qa:synthetic";
const KEY:&str="todo-workbench-v1";
fn sha(b:impl AsRef<[u8]>)->String{format!("{:x}",Sha256::digest(b.as_ref()))}
fn hash(v:&Value)->String{sha(v.to_string())}
fn bucket(id:&str)->i64{Sha256::digest(id.as_bytes())[0] as i64}
fn err(e:rusqlite::Error)->String{e.to_string()}
fn schema(c:&Connection)->R<()>{
 c.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS lab_head(scope TEXT PRIMARY KEY,rev INTEGER NOT NULL,root TEXT NOT NULL,source TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS lab_task(scope TEXT NOT NULL,id TEXT NOT NULL,pos INTEGER NOT NULL,bucket INTEGER NOT NULL,body TEXT NOT NULL,hash TEXT NOT NULL,rev INTEGER NOT NULL,PRIMARY KEY(scope,id)) WITHOUT ROWID;
 CREATE INDEX IF NOT EXISTS lab_bucket ON lab_task(scope,bucket,id);
 CREATE TABLE IF NOT EXISTS lab_part(scope TEXT NOT NULL,key TEXT NOT NULL,body TEXT NOT NULL,hash TEXT NOT NULL,PRIMARY KEY(scope,key)) WITHOUT ROWID;
 CREATE TABLE IF NOT EXISTS lab_hash(scope TEXT NOT NULL,bucket INTEGER NOT NULL,hash TEXT NOT NULL,PRIMARY KEY(scope,bucket)) WITHOUT ROWID;
 CREATE TABLE IF NOT EXISTS lab_receipt(scope TEXT NOT NULL,id TEXT NOT NULL,request TEXT NOT NULL,rev INTEGER NOT NULL,root TEXT NOT NULL,PRIMARY KEY(scope,id)) WITHOUT ROWID;
 CREATE TABLE IF NOT EXISTS lab_evidence(scope TEXT NOT NULL,rev INTEGER NOT NULL,body TEXT NOT NULL,PRIMARY KEY(scope,rev)) WITHOUT ROWID;").map_err(err)
}
fn allowed(scope:&str)->R<()>{if scope=="qa:synthetic"||scope=="qa:other"{Ok(())}else{Err("synthetic scope only".into())}}
fn parts(store:&Value)->R<(Value,Vec<Value>,BTreeMap<String,String>)>{
 let map=store.as_object().ok_or("invalid store")?;
 let mut state:Value=serde_json::from_str(map.get(KEY).and_then(Value::as_str).ok_or("missing snapshot")?).map_err(|e|e.to_string())?;
 if state["version"]!=2{return Err("wrong version".into())}
 let tasks=state.as_object_mut().ok_or("invalid snapshot")?.remove("tasks").and_then(|x|x.as_array().cloned()).ok_or("tasks missing")?;
 let mut seen=BTreeSet::new();
 for t in &tasks{let id=t["id"].as_str().filter(|x|!x.is_empty()&&x.len()<=200).ok_or("invalid task")?;if !seen.insert(id){return Err("duplicate task".into())}}
 let mut kv=BTreeMap::new();for(k,v)in map{if k!=KEY{kv.insert(k.clone(),v.as_str().ok_or("non-string store value")?.to_owned());}}
 Ok((state,tasks,kv))
}
fn source_hash(store:&Value)->R<String>{let (meta,tasks,kv)=parts(store)?;Ok(hash(&json!([meta,tasks,kv])))}
fn put_part(c:&Connection,s:&str,k:&str,b:&str)->R<()>{
 c.execute("INSERT INTO lab_part VALUES(?1,?2,?3,?4) ON CONFLICT(scope,key) DO UPDATE SET body=excluded.body,hash=excluded.hash WHERE lab_part.body<>excluded.body",params![s,k,b,sha(b)]).map_err(err)?;Ok(())
}
fn put_task(c:&Connection,s:&str,t:&Value,pos:i64,rev:i64)->R<()>{
 let id=t["id"].as_str().filter(|x|!x.is_empty()&&x.len()<=200).ok_or("invalid id")?;let b=t.to_string();
 c.execute("INSERT INTO lab_task VALUES(?1,?2,?3,?4,?5,?6,?7) ON CONFLICT(scope,id) DO UPDATE SET pos=excluded.pos,body=excluded.body,hash=excluded.hash,rev=excluded.rev",params![s,id,pos,bucket(id),&b,sha(&b),rev]).map_err(err)?;Ok(())
}
// Domain-separated structured hashes, fixed bucket mapping, deterministic ordering.
fn bucket_hash(c:&Connection,s:&str,b:i64)->R<String>{
 let mut q=c.prepare("SELECT id,pos,hash FROM lab_task WHERE scope=?1 AND bucket=?2 ORDER BY id").map_err(err)?;
 let rows=q.query_map(params![s,b],|r|Ok((r.get::<_,String>(0)?,r.get::<_,i64>(1)?,r.get::<_,String>(2)?))).map_err(err)?.collect::<Result<Vec<_>,_>>().map_err(err)?;
 Ok(hash(&json!(["bucket-v1",b,rows])))
}
fn update_buckets(c:&Connection,s:&str,bs:&BTreeSet<i64>)->R<()>{
 for &b in bs{let h=bucket_hash(c,s,b)?;c.execute("INSERT INTO lab_hash VALUES(?1,?2,?3) ON CONFLICT(scope,bucket) DO UPDATE SET hash=excluded.hash",params![s,b,h]).map_err(err)?;}Ok(())
}
fn root(c:&Connection,s:&str)->R<String>{
 let mut q=c.prepare("SELECT bucket,hash FROM lab_hash WHERE scope=?1 ORDER BY bucket").map_err(err)?;
 let bs=q.query_map([s],|r|Ok((r.get::<_,i64>(0)?,r.get::<_,String>(1)?))).map_err(err)?.collect::<Result<Vec<_>,_>>().map_err(err)?;
 if bs.len()!=256{return Err("bucket count".into())}
 let mut q=c.prepare("SELECT key,hash FROM lab_part WHERE scope=?1 ORDER BY key").map_err(err)?;
 let ps=q.query_map([s],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?))).map_err(err)?.collect::<Result<Vec<_>,_>>().map_err(err)?;
 Ok(hash(&json!(["root-v1",bs,ps])))
}
fn head(c:&Connection,s:&str)->R<(i64,String,String)>{allowed(s)?;c.query_row("SELECT rev,root,source FROM lab_head WHERE scope=?1",[s],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).map_err(err)}
fn migrate(c:&mut Connection,s:&str,store:&Value,confirmed:&str,fail:bool)->R<String>{
 allowed(s)?;if source_hash(store)?!=confirmed{return Err("source changed".into())}
 let (meta,tasks,kv)=parts(store)?;
 let tx=c.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate).map_err(err)?;
 if head(&tx,s).is_ok(){return Err("already migrated".into())}
 put_part(&tx,s,"meta",&meta.to_string())?;
 for(k,v)in kv{put_part(&tx,s,&format!("kv:{k}"),&v)?;}
 for(i,t)in tasks.iter().enumerate(){put_task(&tx,s,t,i as i64,0)?;if fail&&i==tasks.len()/2{return Err("injected migration failure".into())}}
 update_buckets(&tx,s,&(0..256).collect())?;let h=root(&tx,s)?;
 tx.execute("INSERT INTO lab_head VALUES(?1,0,?2,?3)",params![s,h,confirmed]).map_err(err)?;
 if source_hash(&export_snapshot(&tx,s)?)?!=confirmed{return Err("migration equivalence failed".into())}
 if let Ok(marker)=std::env::var("TODO_LAB_MIGRATION_PRECOMMIT"){tx.cache_flush().map_err(err)?;std::fs::write(marker,b"ready").map_err(|e|e.to_string())?;loop{std::thread::park()}}
 tx.commit().map_err(err)?;Ok(h)
}
// Read-side verifier recalculates every row hash from actual bytes, then
// independently rebuilds the bucket/root manifest from the exported values.
fn export(c:&Connection,s:&str)->R<Value>{
 let tx=c.unchecked_transaction().map_err(err)?;let out=export_snapshot(&tx,s)?;tx.commit().map_err(err)?;Ok(out)
}
fn export_snapshot(c:&Connection,s:&str)->R<Value>{
 let (_,expected,_)=head(c,s)?;
 let mut q=c.prepare("SELECT id,pos,body,hash,bucket FROM lab_task WHERE scope=?1 ORDER BY pos,id").map_err(err)?;
 let mut rows=q.query([s]).map_err(err)?;let mut tasks=vec![];
 let mut bs:BTreeMap<i64,Vec<(String,i64,String)>>=(0..256).map(|b|(b,vec![])).collect();
 while let Some(r)=rows.next().map_err(err)?{
  let id:String=r.get(0).map_err(err)?;let pos:i64=r.get(1).map_err(err)?;let raw:String=r.get(2).map_err(err)?;let h:String=r.get(3).map_err(err)?;let b:i64=r.get(4).map_err(err)?;
  let t:Value=serde_json::from_str(&raw).map_err(|e|e.to_string())?;
  if t["id"]!=id||pos!=tasks.len() as i64||bucket(&id)!=b||sha(&raw)!=h{return Err("row integrity/order".into())}
  bs.get_mut(&b).ok_or("bucket")?.push((id,pos,h));tasks.push(t);
 }
 let mut q=c.prepare("SELECT key,body,hash FROM lab_part WHERE scope=?1 ORDER BY key").map_err(err)?;
 let mut rows=q.query([s]).map_err(err)?;let mut ps=vec![];let mut meta=None;let mut kv=serde_json::Map::new();
 while let Some(r)=rows.next().map_err(err)?{let k:String=r.get(0).map_err(err)?;let raw:String=r.get(1).map_err(err)?;let h:String=r.get(2).map_err(err)?;if sha(&raw)!=h{return Err("part integrity".into())}ps.push((k.clone(),h));if k=="meta"{meta=Some(serde_json::from_str::<Value>(&raw).map_err(|e|e.to_string())?)}else if let Some(k)=k.strip_prefix("kv:"){if k==KEY{return Err("reserved key".into())}kv.insert(k.into(),json!(raw));}else{return Err("unknown part".into())}}
 let mut manifest=vec![];for (b,mut rows)in bs{rows.sort_by(|a,b|a.0.cmp(&b.0));manifest.push((b,hash(&json!(["bucket-v1",b,rows]))));}
 let actual=hash(&json!(["root-v1",manifest,ps]));
 if actual!=expected||root(c,s)?!=expected{return Err("manifest integrity".into())}
 let mut state=meta.ok_or("missing metadata")?;state.as_object_mut().ok_or("invalid metadata")?.insert("tasks".into(),json!(tasks));kv.insert(KEY.into(),json!(state.to_string()));Ok(Value::Object(kv))
}
// No write-back into the old database. Export is permitted only against
// the exact confirmed semantic source; a changed old writer needs reconciliation.
fn export_for_legacy(c:&Connection,s:&str,source:&Value)->R<Value>{
 let tx=c.unchecked_transaction().map_err(err)?;
 if source_hash(source)?!=head(&tx,s)?.2{return Err("legacy source changed; reconcile before export".into())}
 let out=export_snapshot(&tx,s)?;tx.commit().map_err(err)?;Ok(out)
}
#[derive(Clone,serde::Serialize)]
struct Edit{ id:String,expected:String,expected_rev:i64,next:Value }
#[derive(Clone,serde::Serialize)]
struct Change{ base:i64,root:String,edits:Vec<Edit>,meta:Option<Value>,kv:BTreeMap<String,Option<String>> }
fn apply(c:&mut Connection,s:&str,rid:&str,p:&Change,fail:bool)->R<(i64,String)>{
 allowed(s)?;if uuid::Uuid::parse_str(rid).is_err()||p.edits.len()>500{return Err("invalid request".into())}
 let req=sha(serde_json::to_string(p).map_err(|e|e.to_string())?);let tx=c.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate).map_err(err)?;
 let saved:Option<(String,i64,String)>=tx.query_row("SELECT request,rev,root FROM lab_receipt WHERE scope=?1 AND id=?2",params![s,rid],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).optional().map_err(err)?;
 if let Some((h,r,root))=saved{return if h==req{Ok((r,root))}else{Err("request collision".into())}}
 let (rev,h,_)=head(&tx,s)?;if rev!=p.base||h!=p.root||root(&tx,s)?!=h{return Err("stale base or manifest".into())}
 let next_rev=rev.checked_add(1).ok_or("revision overflow")?;let mut bs=BTreeSet::new();let mut seen=BTreeSet::new();let mut evidence=vec![];
 for e in &p.edits{
  if !seen.insert(&e.id)||e.next["id"]!=e.id{return Err("invalid edit".into())}
  let (pos,raw,old,row_rev):(i64,String,String,i64)=tx.query_row("SELECT pos,body,hash,rev FROM lab_task WHERE scope=?1 AND id=?2",params![s,e.id],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))).map_err(err)?;
  if sha(&raw)!=old||old!=e.expected||row_rev!=e.expected_rev{return Err("task conflict".into())}
  let new=hash(&e.next);if new!=old{put_task(&tx,s,&e.next,pos,next_rev)?;bs.insert(bucket(&e.id));evidence.push(json!({"id":e.id,"beforeHash":old,"afterHash":new}));}
 }
 if let Some(m)=&p.meta{if !m.is_object()||m.get("tasks").is_some()||m["version"]!=2{return Err("metadata invalid".into())}put_part(&tx,s,"meta",&m.to_string())?;}
 for (k,v)in &p.kv{if k==KEY{return Err("reserved key".into())}let k=format!("kv:{k}");if let Some(v)=v{put_part(&tx,s,&k,v)?}else{tx.execute("DELETE FROM lab_part WHERE scope=?1 AND key=?2",params![s,k]).map_err(err)?;}}
 update_buckets(&tx,s,&bs)?;let h=root(&tx,s)?;
 // Hash evidence only; NOT equivalent to the production history journal.
 tx.execute("INSERT INTO lab_evidence VALUES(?1,?2,?3)",params![s,next_rev,json!({"tasks":evidence,"meta":p.meta.is_some(),"keys":p.kv.keys().collect::<Vec<_>>()}).to_string()]).map_err(err)?;
 tx.execute("DELETE FROM lab_evidence WHERE scope=?1 AND rev<=?2",params![s,next_rev-300]).map_err(err)?;
 tx.execute("UPDATE lab_head SET rev=?2,root=?3 WHERE scope=?1",params![s,next_rev,&h]).map_err(err)?;
 tx.execute("INSERT INTO lab_receipt VALUES(?1,?2,?3,?4,?5)",params![s,rid,req,next_rev,h]).map_err(err)?;
 if fail{return Err("injected before commit".into())}
 if let Ok(marker)=std::env::var("TODO_LAB_PRECOMMIT"){tx.cache_flush().map_err(err)?;std::fs::write(marker,b"ready").map_err(|e|e.to_string())?;loop{std::thread::park()}}
 tx.commit().map_err(err)?;Ok((next_rev,h))
}
fn fixture(n:usize,d:usize)->Value{
 let tasks=(0..n).map(|i|json!({"id":format!("qa-{i}"),"title":format!("synthetic task {i}"),"notes":"synthetic","priority":0,"activity":(0..d).map(|j|json!({"id":format!("qa-{i}-{j}"),"kind":"priority","category":"property","operation":format!("op-{j}"),"changes":[{"field":"priority","before":"0","after":"1"}]})).collect::<Vec<_>>() })).collect::<Vec<_>>();
 json!({KEY:json!({"version":2,"tasks":tasks,"sessions":[],"lists":[],"tags":[]}).to_string(),"todo-cloud-meta":"synthetic"})
}
fn request(c:&Connection,s:&str,t:&Value)->Change{
 let (base,root,_)=head(c,s).unwrap();let (expected,expected_rev)=c.query_row("SELECT hash,rev FROM lab_task WHERE scope=?1 AND id=?2",params![s,t["id"].as_str().unwrap()],|r|Ok((r.get(0)?,r.get(1)?))).unwrap();
 Change{base,root,edits:vec![Edit{id:t["id"].as_str().unwrap().into(),expected,expected_rev,next:t.clone()}],meta:None,kv:BTreeMap::new()}
}
fn id()->String{uuid::Uuid::new_v4().to_string()}
fn temporary()->std::path::PathBuf{let d=std::env::temp_dir().join(format!("todo-lab-{}",id()));std::fs::create_dir(&d).unwrap();d}
#[test]fn migration_cas_and_independent_integrity(){
 let mut c=Connection::open_in_memory().unwrap();schema(&c).unwrap();let store=fixture(20,5);let digest=source_hash(&store).unwrap();
 assert!(migrate(&mut c,S,&store,"wrong",false).is_err());assert!(migrate(&mut c,S,&store,&digest,true).is_err());
 assert_eq!(c.query_row("SELECT count(*) FROM lab_task",[],|r|r.get::<_,i64>(0)).unwrap(),0);
 migrate(&mut c,S,&store,&digest,false).unwrap();migrate(&mut c,"qa:other",&store,&digest,false).unwrap();assert!(migrate(&mut c,S,&store,&digest,false).is_err());
 assert_eq!(source_hash(&export(&c,S).unwrap()).unwrap(),digest);
 let (meta,mut ts,mut kv)=parts(&store).unwrap();let mut t=ts[0].clone();t["priority"]=json!(3);let mut p=request(&c,S,&t);p.kv.insert("todo-cloud-meta".into(),Some("changed".into()));
 let k=id();assert!(apply(&mut c,S,&k,&p,true).is_err());assert_eq!(source_hash(&export(&c,S).unwrap()).unwrap(),digest);
 let r=apply(&mut c,S,&k,&p,false).unwrap();assert_eq!(apply(&mut c,S,&k,&p,false).unwrap(),r);assert!(apply(&mut c,S,&id(),&p,false).is_err());let mut bad=p.clone();bad.edits[0].next["priority"]=json!(2);assert!(apply(&mut c,S,&k,&bad,false).is_err());
 ts[0]=t;kv.insert("todo-cloud-meta".into(),"changed".into());let mut expected=meta;expected["tasks"]=json!(ts);let mut expected_store=json!(kv);expected_store[KEY]=json!(expected.to_string());assert_eq!(source_hash(&export(&c,S).unwrap()).unwrap(),source_hash(&expected_store).unwrap());
 assert_eq!(source_hash(&export(&c,"qa:other").unwrap()).unwrap(),digest);assert!(export(&c,"guest").is_err());
 let mut invalid=request(&c,S,&ts[0]);invalid.edits[0].expected="bad".into();assert!(apply(&mut c,S,&id(),&invalid,false).is_err());
 let mut duplicate=request(&c,S,&ts[0]);duplicate.edits.push(duplicate.edits[0].clone());assert!(apply(&mut c,S,&id(),&duplicate,false).is_err());
 let before=head(&c,S).unwrap();assert_eq!(before.0,1);
 c.execute("UPDATE lab_task SET body='{}' WHERE scope=?1 AND id='qa-0'",[S]).unwrap();assert!(export(&c,S).is_err());
}
#[test]fn legacy_roundtrip_and_backup(){
 let dir=temporary();let mut legacy=Connection::open(dir.join("source.sqlite3")).unwrap();super::storage::schema(&legacy).unwrap();let store=fixture(100,5);super::storage::persist_store(&mut legacy,"guest",&store.to_string()).unwrap();
 let source:String=legacy.query_row("SELECT body FROM workspace_store WHERE scope='guest'",[],|r|r.get(0)).unwrap();let source:Value=serde_json::from_str(&source).unwrap();let digest=source_hash(&source).unwrap();
 let mut c=Connection::open(dir.join("lab.sqlite3")).unwrap();schema(&c).unwrap();migrate(&mut c,S,&source,&digest,false).unwrap();
 let (_,mut ts,_)=parts(&source).unwrap();ts[1]["title"]=json!("synthetic changed");let p=request(&c,S,&ts[1]);apply(&mut c,S,&id(),&p,false).unwrap();
 let exported=export_for_legacy(&c,S,&source).unwrap();let expected=source_hash(&exported).unwrap();
 let mut changed_source=source.clone();changed_source["todo-cloud-meta"]=json!("legacy edited");assert!(export_for_legacy(&c,S,&changed_source).is_err());
 c.execute("VACUUM INTO ?1",[dir.join("backup.sqlite3").to_str().unwrap()]).unwrap();drop(c);
 let c=Connection::open(dir.join("backup.sqlite3")).unwrap();assert_eq!(source_hash(&export(&c,S).unwrap()).unwrap(),expected);
 let mut out=Connection::open(dir.join("export.sqlite3")).unwrap();super::storage::schema(&out).unwrap();super::storage::persist_store(&mut out,"guest",&exported.to_string()).unwrap();
 let raw:String=out.query_row("SELECT body FROM workspace_store WHERE scope='guest'",[],|r|r.get(0)).unwrap();assert_eq!(source_hash(&serde_json::from_str(&raw).unwrap()).unwrap(),expected);
 let raw:String=legacy.query_row("SELECT body FROM workspace_store WHERE scope='guest'",[],|r|r.get(0)).unwrap();assert_eq!(source_hash(&serde_json::from_str(&raw).unwrap()).unwrap(),digest);
 assert_ne!(expected,digest);assert_eq!(c.query_row("PRAGMA integrity_check",[],|r|r.get::<_,String>(0)).unwrap(),"ok");
 drop((legacy,c,out));std::fs::remove_dir_all(dir).unwrap();
}
#[test]fn row_version_detects_aba_even_with_rebased_workspace(){
 let mut c=Connection::open_in_memory().unwrap();schema(&c).unwrap();let store=fixture(3,1);migrate(&mut c,S,&store,&source_hash(&store).unwrap(),false).unwrap();
 let (_,tasks,_)=parts(&store).unwrap();let original=tasks[0].clone();let mut new=original.clone();new["priority"]=json!(3);
 let stale=request(&c,S,&new);let first=apply(&mut c,S,&id(),&stale,false).unwrap();
 let back=request(&c,S,&original);let second=apply(&mut c,S,&id(),&back,false).unwrap();
 assert_eq!(second.1,stale.root);assert_ne!(first.1,second.1);
 let mut rebased=stale;rebased.base=second.0;rebased.root=second.1;
 assert!(apply(&mut c,S,&id(),&rebased,false).unwrap_err().contains("task conflict"));
}
#[test]fn randomized_oracle_and_concurrent_writers(){
 let dir=temporary();let path=dir.join("random.sqlite3");let mut c=Connection::open(&path).unwrap();schema(&c).unwrap();
 let mut store=fixture(128,3);let mut state:Value=serde_json::from_str(store[KEY].as_str().unwrap()).unwrap();
 // Opaque workspace keys and task payloads must survive round-trip, including
 // missing fields, null, Unicode, lists, recurrence and actual ordering.
 state["tasks"][0]["repeat"]=json!("daily");state["tasks"][0]["seriesId"]=json!("synthetic-series");
 state["tasks"][1]["parentId"]=json!("qa-0");state["tasks"][2]["dependsOn"]=json!(["qa-1"]);
 state["tasks"][3]["notes"]=json!("合成研究🚀");state["tasks"][4]["unknownFutureField"]=json!({"nullable":null,"array":[3,1,2]});
 state["sessions"]=json!([{"id":"synthetic-focus","taskId":"qa-3","seconds":120}]);
 store[KEY]=json!(state.to_string());store["todo-cloud-base"]=json!("opaque synthetic sync base");
 migrate(&mut c,S,&store,&source_hash(&store).unwrap(),false).unwrap();
 let mut other=Connection::open(&path).unwrap();
 let stale=request(&other,S,&state["tasks"][1]);
 let mut x=17u64;
 for i in 0..320{
  x=x.wrapping_mul(6364136223846793005).wrapping_add(1);let at=(x>>32) as usize%128;
  state["tasks"][at]["priority"]=json!(i%4);state["tasks"][at]["title"]=json!(format!("synthetic-{i}"));
  let mut p=request(&c,S,&state["tasks"][at]);
  if i%7==0{let mut meta=state.clone();meta.as_object_mut().unwrap().remove("tasks");meta["syntheticRevision"]=json!(i);state["syntheticRevision"]=json!(i);p.meta=Some(meta);}
  if i%11==0{p.kv.insert("todo-cloud-meta".into(),Some(format!("synthetic-{i}")));store["todo-cloud-meta"]=json!(format!("synthetic-{i}"));}
  if i%13==0{p.kv.insert("todo-cloud-base".into(),None);store.as_object_mut().unwrap().remove("todo-cloud-base");}
  let key=id();let result=apply(&mut c,S,&key,&p,false).unwrap();assert_eq!(apply(&mut other,S,&key,&p,false).unwrap(),result);
  if i==0{assert!(apply(&mut other,S,&id(),&stale,false).is_err());}
  store[KEY]=json!(state.to_string());
  let actual=export(&other,S).unwrap();
  // Independent whole-document equality, not just the new hash.
  assert_eq!(parts(&actual).unwrap(),parts(&store).unwrap());
 }
 assert_eq!(c.query_row("SELECT count(*) FROM lab_evidence WHERE scope=?1",[S],|r|r.get::<_,i64>(0)).unwrap(),300);
 assert_eq!(c.query_row("SELECT count(*) FROM lab_receipt WHERE scope=?1",[S],|r|r.get::<_,i64>(0)).unwrap(),320);
 c.execute("UPDATE lab_part SET body='corrupt' WHERE scope=?1 AND key='meta'",[S]).unwrap();assert!(export(&c,S).is_err());
 drop((c,other));std::fs::remove_dir_all(dir).unwrap();
}
#[test]fn crash_child(){
 let Ok(dir)=std::env::var("TODO_LAB_CRASH_DIR")else{return};
 let mut c=Connection::open(std::path::Path::new(&dir).join("lab.sqlite3")).unwrap();
 let mode=std::env::var("TODO_LAB_MODE").unwrap();
 if mode=="migrate"{let store=fixture(1000,1);migrate(&mut c,S,&store,&source_hash(&store).unwrap(),false).unwrap();}
 else{let (_,mut tasks,_)=parts(&export(&c,S).unwrap()).unwrap();tasks[0]["priority"]=json!(3);let p=request(&c,S,&tasks[0]);apply(&mut c,S,"00000000-0000-4000-8000-000000000001",&p,false).unwrap();}
 std::fs::write(std::path::Path::new(&dir).join("committed"),b"ready").unwrap();loop{std::thread::park()}
}
#[test]#[ignore]fn incremental_crash_boundaries(){
 use std::process::{Command,Stdio};use std::time::Duration;
 let dir=temporary();let path=dir.join("lab.sqlite3");let c=Connection::open(&path).unwrap();schema(&c).unwrap();drop(c);
 let store=fixture(1000,1);let digest=source_hash(&store).unwrap();
 for (mode,pre) in [("migrate",true),("migrate",false),("apply",true),("apply",false)]{
  let marker=dir.join(if pre{"precommit"}else{"committed"});if marker.exists(){std::fs::remove_file(&marker).unwrap();}
  let mut cmd=Command::new(std::env::current_exe().unwrap());cmd.args(["incremental_research::crash_child","--exact","--nocapture"]).env("TODO_LAB_CRASH_DIR",&dir).env("TODO_LAB_MODE",mode).stdout(Stdio::null()).stderr(Stdio::null());
  if pre{cmd.env(if mode=="migrate"{"TODO_LAB_MIGRATION_PRECOMMIT"}else{"TODO_LAB_PRECOMMIT"},&marker);}
  let mut child=cmd.spawn().unwrap();let start=Instant::now();
  while !marker.exists()&&start.elapsed()<Duration::from_secs(15){if child.try_wait().unwrap().is_some(){break}std::thread::sleep(Duration::from_millis(10));}
  let ready=marker.exists();let wal=std::fs::metadata(dir.join("lab.sqlite3-wal")).map(|m|m.len()).unwrap_or(0);let _=child.kill();let status=child.wait().unwrap();assert!(ready&&wal>0&&!status.success(),"child boundary");
  let c=Connection::open(&path).unwrap();
  let count=c.query_row("SELECT count(*) FROM lab_receipt",[],|r|r.get::<_,i64>(0)).unwrap();
  if mode=="migrate"&&pre{assert!(head(&c,S).is_err());assert_eq!(c.query_row("SELECT count(*) FROM lab_task",[],|r|r.get::<_,i64>(0)).unwrap(),0);}
  else if mode=="migrate"||pre{assert_eq!(head(&c,S).unwrap().0,0);assert_eq!(source_hash(&export(&c,S).unwrap()).unwrap(),digest);assert_eq!(count,0);}
  else{assert_eq!(head(&c,S).unwrap().0,1);assert_eq!(count,1);let (_,tasks,_)=parts(&export(&c,S).unwrap()).unwrap();assert_eq!(tasks[0]["priority"],3);}
  assert_eq!(c.query_row("PRAGMA integrity_check",[],|r|r.get::<_,String>(0)).unwrap(),"ok");
  println!("crash mode={mode} precommit={pre} wal_bytes={wal} receipts={count} integrity=ok");
 }
 std::fs::remove_dir_all(dir).unwrap();
}
#[test]#[ignore]fn incremental_matrix(){
 fn stats(v:&mut [f64])->String{v.sort_by(|a,b|a.total_cmp(b));let n=v.len();format!("{:.3}/{:.3}/{:.3}/{:.3}",(v[(n-1)/2]+v[n/2])/2.,v[((n as f64*0.95).ceil() as usize)-1],v[((n as f64*0.99).ceil() as usize)-1],v[n-1])}
 for (n,d,samples) in [(1000,1,60),(5000,5,60),(10000,5,120)]{
  let dir=temporary();let store=fixture(n,d);let mut legacy=Connection::open(dir.join("legacy.sqlite3")).unwrap();super::storage::schema(&legacy).unwrap();super::storage::persist_store(&mut legacy,"guest",&store.to_string()).unwrap();
  let mut lab=Connection::open(dir.join("lab.sqlite3")).unwrap();schema(&lab).unwrap();let start=Instant::now();migrate(&mut lab,S,&store,&source_hash(&store).unwrap(),false).unwrap();let migration=start.elapsed().as_secs_f64()*1000.;
  for c in [&legacy,&lab]{c.execute_batch("PRAGMA wal_autocheckpoint=0; PRAGMA wal_checkpoint(TRUNCATE)").unwrap();}
  let mut state:Value=serde_json::from_str(store[KEY].as_str().unwrap()).unwrap();let mut expected=store.clone();let mut full=vec![];let mut inc=vec![];let mut verify=vec![];let mut bridge=vec![];
  for i in 0..samples{
   state["tasks"][i%n]["priority"]=json!(3);
   let t=Instant::now();expected[KEY]=json!(state.to_string());super::storage::persist_store(&mut legacy,"guest",&expected.to_string()).unwrap();full.push(t.elapsed().as_secs_f64()*1000.);
   let t=Instant::now();let p=request(&lab,S,&state["tasks"][i%n]);apply(&mut lab,S,&id(),&p,false).unwrap();inc.push(t.elapsed().as_secs_f64()*1000.);
   if i%20==19||i+1==samples{
    let t=Instant::now();let (_,full_tasks,_)=parts(&expected).unwrap();let changed=full_tasks.iter().filter(|v|v["id"]==state["tasks"][i%n]["id"]).count();assert_eq!(changed,1);bridge.push(t.elapsed().as_secs_f64()*1000.);
    let t=Instant::now();let result=export(&lab,S).unwrap();assert_eq!(source_hash(&result).unwrap(),source_hash(&expected).unwrap());verify.push(t.elapsed().as_secs_f64()*1000.);}
  }
  let size=|f:&str|std::fs::metadata(dir.join(f)).map(|m|m.len()).unwrap_or(0);
  assert_eq!(head(&lab,S).unwrap().0,samples as i64);assert_eq!(lab.query_row("PRAGMA integrity_check",[],|r|r.get::<_,String>(0)).unwrap(),"ok");
  println!("matrix tasks={n} density={d} samples={samples} migration_ms={migration:.3} full_ms={} inc_ms={} verify_ms={} bridge_parse_ms={} full_wal={} inc_wal={} full_db={} inc_db={}",stats(&mut full),stats(&mut inc),stats(&mut verify),stats(&mut bridge),size("legacy.sqlite3-wal"),size("lab.sqlite3-wal"),size("legacy.sqlite3"),size("lab.sqlite3"));
  drop((legacy,lab));std::fs::remove_dir_all(dir).unwrap();
 }
}


#[test]#[ignore]fn engine_memory_sample(){
 let mode=std::env::var("TODO_LAB_ENGINE").unwrap();let dir=temporary();let store=fixture(10000,5);let mut state:Value=serde_json::from_str(store[KEY].as_str().unwrap()).unwrap();
 let mut c=Connection::open(dir.join("engine.sqlite3")).unwrap();
 if mode=="full"{super::storage::schema(&c).unwrap();super::storage::persist_store(&mut c,"guest",&store.to_string()).unwrap();}
 else{assert_eq!(mode,"incremental");schema(&c).unwrap();migrate(&mut c,S,&store,&source_hash(&store).unwrap(),false).unwrap();}
 drop(store);let start=Instant::now();
 for i in 0..30{
  state["tasks"][i]["priority"]=json!(3);
  if mode=="full"{let store=json!({KEY:state.to_string(),"todo-cloud-meta":"synthetic"});super::storage::persist_store(&mut c,"guest",&store.to_string()).unwrap();}
  else{let p=request(&c,S,&state["tasks"][i]);apply(&mut c,S,&id(),&p,false).unwrap();}
 }
 println!("engine={mode} edits=30 elapsed_ms={:.3}",start.elapsed().as_secs_f64()*1000.);
 assert_eq!(c.query_row("PRAGMA integrity_check",[],|r|r.get::<_,String>(0)).unwrap(),"ok");
 if mode=="incremental"{let actual=export(&c,S).unwrap();assert_eq!(serde_json::from_str::<Value>(actual[KEY].as_str().unwrap()).unwrap(),state);}
 else{let raw:String=c.query_row("SELECT body FROM snapshots WHERE scope='guest'",[],|r|r.get(0)).unwrap();assert_eq!(serde_json::from_str::<Value>(&raw).unwrap(),state);}
 drop(c);std::fs::remove_dir_all(dir).unwrap();
}
