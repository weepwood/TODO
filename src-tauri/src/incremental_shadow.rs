// Test-only bridge. The authoritative writer remains the existing storage
// transaction. Shadow rows and full proof are checked before that transaction
// commits. Never activated by an application or CLI command.
use super::*;
use serde_json::{json,Value};
use std::cell::RefCell;
use std::collections::{BTreeMap,BTreeSet};
use sha2::{Sha256,Digest};
type R<T>=Result<T,String>;
const KEY:&str="todo-workbench-v1";
type Stage=Option<(Value,bool)>;
thread_local!{static STAGE:RefCell<Stage>=const{RefCell::new(None)};}
fn err(e:rusqlite::Error)->String{e.to_string()}
fn hash(s:&str)->String{format!("{:x}",Sha256::digest(s.as_bytes()))}
fn state(raw:&str)->R<Value>{serde_json::from_str(raw).map_err(|e|e.to_string())}
fn schema(c:&Connection)->R<()>{
 c.execute_batch("CREATE TABLE shadow_task(scope TEXT NOT NULL,id TEXT NOT NULL,pos INTEGER NOT NULL,body TEXT NOT NULL,hash TEXT NOT NULL,PRIMARY KEY(scope,id)) WITHOUT ROWID;
 CREATE TABLE shadow_meta(scope TEXT PRIMARY KEY,body TEXT NOT NULL);
 CREATE TABLE shadow_kv(scope TEXT NOT NULL,key TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(scope,key)) WITHOUT ROWID;
 CREATE TABLE shadow_head(scope TEXT PRIMARY KEY,rev INTEGER NOT NULL,digest TEXT NOT NULL);").map_err(err)
}
fn read(c:&Connection,s:&str)->R<(Value,Value,i64)>{
 let (rev,digest):(i64,String)=c.query_row("SELECT rev,digest FROM shadow_head WHERE scope=?1",[s],|r|Ok((r.get(0)?,r.get(1)?))).map_err(err)?;
 let raw:String=c.query_row("SELECT body FROM shadow_meta WHERE scope=?1",[s],|r|r.get(0)).map_err(err)?;
 let mut meta=state(&raw)?;let mut tasks=vec![];
 let mut q=c.prepare("SELECT id,pos,body,hash FROM shadow_task WHERE scope=?1 ORDER BY pos,id").map_err(err)?;
 let mut rows=q.query([s]).map_err(err)?;
 while let Some(r)=rows.next().map_err(err)?{
  let id:String=r.get(0).map_err(err)?;let pos:i64=r.get(1).map_err(err)?;let raw:String=r.get(2).map_err(err)?;let h:String=r.get(3).map_err(err)?;
  let v=state(&raw)?;if v["id"]!=id||pos!=tasks.len() as i64||hash(&raw)!=h{return Err("shadow task integrity".into())}tasks.push(v);
 }
 meta.as_object_mut().ok_or("meta")?.insert("tasks".into(),json!(tasks));
  let mut q=c.prepare("SELECT key,body FROM shadow_kv WHERE scope=?1 ORDER BY key").map_err(err)?;
 let kv=q.query_map([s],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?))).map_err(err)?.collect::<Result<BTreeMap<_,_>,_>>().map_err(err)?;
 let kv=json!(kv);if hash(&json!([meta,kv]).to_string())!=digest{return Err("shadow head integrity".into())}
 Ok((meta,kv,rev))
}
fn put(c:&Connection,s:&str,t:&Value,pos:i64)->R<()>{
 let id=t["id"].as_str().filter(|s|!s.is_empty()).ok_or("id")?;let raw=t.to_string();
 c.execute("INSERT INTO shadow_task VALUES(?1,?2,?3,?4,?5) ON CONFLICT(scope,id) DO UPDATE SET pos=excluded.pos,body=excluded.body,hash=excluded.hash",params![s,id,pos,&raw,hash(&raw)]).map_err(err)?;Ok(())
}
fn meta(v:&Value)->R<Value>{let mut m=v.clone();m.as_object_mut().ok_or("meta")?.remove("tasks");Ok(m)}
fn kv(store:&Value)->R<Value>{let mut m=store.clone();m.as_object_mut().ok_or("store")?.remove(KEY);Ok(m)}
fn write_kv(c:&Connection,s:&str,old:&Value,new:&Value)->R<()>{
 let a=old.as_object().ok_or("kv")?;let b=new.as_object().ok_or("kv")?;
 for k in a.keys(){if !b.contains_key(k){c.execute("DELETE FROM shadow_kv WHERE scope=?1 AND key=?2",params![s,k]).map_err(err)?;}}
 for(k,v)in b{if a.get(k)!=Some(v){c.execute("INSERT INTO shadow_kv VALUES(?1,?2,?3) ON CONFLICT(scope,key) DO UPDATE SET body=excluded.body",params![s,k,v.as_str().ok_or("kv string")?]).map_err(err)?;}}
 Ok(())
}
pub(super) fn patch(before:&Value,after:&Value)->Value{
 let a:BTreeMap<_,_>=before["tasks"].as_array().unwrap().iter().map(|t|(t["id"].as_str().unwrap(),t)).collect();
 let b:BTreeMap<_,_>=after["tasks"].as_array().unwrap().iter().map(|t|(t["id"].as_str().unwrap(),t)).collect();
 let put:Vec<_>=b.iter().filter(|(id,t)|a.get(**id)!=Some(t)).map(|(id,t)|json!({"id":id,"before":a.get(id),"after":t})).collect();
 let remove:Vec<_>=a.iter().filter(|(id,_)|!b.contains_key(**id)).map(|(id,t)|json!({"id":id,"before":t})).collect();
 let order=|v:&Value|v["tasks"].as_array().unwrap().iter().map(|t|t["id"].clone()).collect::<Vec<_>>();
 let ao=order(before);let bo=order(after);let m=meta(before).unwrap();let n=meta(after).unwrap();
 json!({"put":put,"remove":remove,"order":if ao==bo{Value::Null}else{json!(bo)},"meta":if m==n{Value::Null}else{json!({"before":m,"after":n})}})
}
fn apply(c:&Connection,s:&str,p:&Value,next:&Value,new_kv:&Value,fail:bool)->R<()>{
 let old_head:Option<i64>=c.query_row("SELECT rev FROM shadow_head WHERE scope=?1",[s],|r|r.get(0)).optional().map_err(err)?;
 let tasks=next["tasks"].as_array().ok_or("tasks")?;
 if old_head.is_none()||p["kind"]=="snapshot"{
  // Full fallback is permitted only on an explicitly staged trusted snapshot.
  // Never recover silently from a damaged shadow.
  if let Some(rev)=old_head{if p["base"]!=rev{return Err("shadow stale fallback".into())}read(c,s)?;}else if p["kind"]!="snapshot"{return Err("shadow requires initial snapshot".into())}
  c.execute("DELETE FROM shadow_task WHERE scope=?1",[s]).map_err(err)?;
  c.execute("DELETE FROM shadow_kv WHERE scope=?1",[s]).map_err(err)?;
  let mut ids=BTreeSet::new();for(i,t)in tasks.iter().enumerate(){if !ids.insert(t["id"].as_str().ok_or("id")?){return Err("duplicate id".into())}put(c,s,t,i as i64)?;}
  write_kv(c,s,&json!({}),new_kv)?;
  c.execute("INSERT INTO shadow_meta VALUES(?1,?2) ON CONFLICT(scope) DO UPDATE SET body=excluded.body",params![s,meta(next)?.to_string()]).map_err(err)?;
 }else{
  let (before,old_kv,rev)=read(c,s)?;if p["base"]!=rev{return Err("shadow stale base".into())}
  let d=&p["patch"];let mut seen=BTreeSet::new();
  for x in d["remove"].as_array().ok_or("remove")?{
   let id=x["id"].as_str().ok_or("remove id")?;
   if !seen.insert(id)||!before["tasks"].as_array().unwrap().iter().any(|t|t["id"]==id&&t==&x["before"]){return Err("stale remove".into())}
   c.execute("DELETE FROM shadow_task WHERE scope=?1 AND id=?2",params![s,id]).map_err(err)?;
  }
  for x in d["put"].as_array().ok_or("put")?{
   let id=x["id"].as_str().ok_or("put id")?;let old=before["tasks"].as_array().unwrap().iter().find(|t|t["id"]==id);
   if !seen.insert(id)||old.unwrap_or(&Value::Null)!=&x["before"]||x["after"]["id"]!=id{return Err("stale put".into())}
   let pos:Option<i64>=c.query_row("SELECT pos FROM shadow_task WHERE scope=?1 AND id=?2",params![s,id],|r|r.get(0)).optional().map_err(err)?;
   put(c,s,&x["after"],pos.unwrap_or(-1))?;
  }
  if let Some(order)=d["order"].as_array(){
   let mut ids=BTreeSet::new();for(i,id)in order.iter().enumerate(){let id=id.as_str().ok_or("order id")?;if !ids.insert(id)||c.execute("UPDATE shadow_task SET pos=?3 WHERE scope=?1 AND id=?2 AND pos<>?3",params![s,id,i as i64]).map_err(err)?==0&&c.query_row("SELECT count(*) FROM shadow_task WHERE scope=?1 AND id=?2",params![s,id],|r|r.get::<_,i64>(0)).map_err(err)?!=1{return Err("invalid order".into())}}
  }
  if !d["meta"].is_null(){
   if meta(&before)?!=d["meta"]["before"]{return Err("stale metadata".into())}
   c.execute("UPDATE shadow_meta SET body=?2 WHERE scope=?1",params![s,d["meta"]["after"].to_string()]).map_err(err)?;
  }
  write_kv(c,s,&old_kv,new_kv)?;
 }
 let rev=old_head.unwrap_or(-1)+1;
 c.execute("INSERT INTO shadow_head VALUES(?1,?2,?3) ON CONFLICT(scope) DO UPDATE SET rev=excluded.rev,digest=excluded.digest",params![s,rev,hash(&json!([next,new_kv]).to_string())]).map_err(err)?;
 let (actual,actual_kv,_)=read(c,s)?;
 if actual!=*next||actual_kv!=*new_kv{return Err("shadow equivalence failed".into())}
 if fail{return Err("injected shadow failure".into())}Ok(())
}
pub(super) fn active()->bool{STAGE.with(|s|s.borrow().is_some())}
pub(super) fn before_commit(c:&Connection,s:&str,body:&str,store:Option<&str>,prior:Option<&str>,prior_store:Option<&str>)->R<()>{
 STAGE.with(|slot|{
  let stage=slot.borrow();let Some((p,fail))=stage.as_ref()else{return Ok(())};
  if s!="guest"&&s!="00000000-0000-4000-8000-000000000001"{return Err("synthetic scope only".into())}
  let value=state(store.ok_or("shadow requires store")?)?;
  let initialized:bool=c.query_row("SELECT EXISTS(SELECT 1 FROM shadow_head WHERE scope=?1)",[s],|r|r.get(0)).map_err(err)?;
  if initialized{let (previous,old_kv,_)=read(c,s)?;if Some(previous)!=prior.map(state).transpose()?||Some(old_kv)!=prior_store.map(state).transpose()?.as_ref().map(kv).transpose()?{return Err("authority diverged from shadow".into())}}
  if p["kind"]!="delta"&&p["kind"]!="snapshot"{return Err("invalid shadow plan".into())}
  apply(c,s,p,&state(body)?,&kv(&value)?,*fail)
 })
}
pub(super) fn persist(c:&mut Connection,s:&str,store:&Value,receipt:Option<&Value>,p:Value,fail:bool)->R<()>{
 STAGE.with(|slot|{assert!(slot.borrow().is_none());*slot.borrow_mut()=Some((p,fail));});
 struct Reset;impl Drop for Reset{fn drop(&mut self){STAGE.with(|slot|*slot.borrow_mut()=None);}}
 let _reset=Reset;super::storage::persist_store_receipt(c,s,&store.to_string(),receipt)
}
pub(super) fn wrapped(v:&Value)->Value{json!({KEY:v.to_string(),"todo-cloud-meta":"synthetic"})}
pub(super) fn delta(c:&Connection,s:&str,a:&Value,b:&Value)->Value{let (_,_,rev)=read(c,s).unwrap();json!({"kind":"delta","base":rev,"patch":patch(a,b)})}
pub(super) fn db()->Connection{let c=Connection::open_in_memory().unwrap();super::storage::schema(&c).unwrap();schema(&c).unwrap();c}
pub(super) fn check(c:&Connection,s:&str,v:&Value){
 let (a,k,_)=read(c,s).unwrap();assert_eq!(a,*v);assert_eq!(k,kv(&wrapped(v)).unwrap());
 let raw:String=c.query_row("SELECT body FROM snapshots WHERE scope=?1",[s],|r|r.get(0)).unwrap();assert_eq!(state(&raw).unwrap(),a);
 let journal=super::operation_history::history_read(c,s,true,300).unwrap();assert_eq!(journal["intact"],true);
}
#[test]fn shared_editor_fixtures(){
 let Ok(path)=std::env::var("TODO_R2_FIXTURES")else{return};
 let f:Value=state(&std::fs::read_to_string(path).unwrap()).unwrap();
 let mut c=db();let mut refdb=Connection::open_in_memory().unwrap();super::storage::schema(&refdb).unwrap();
 let mut prev=f["base"].clone();persist(&mut c,"guest",&wrapped(&prev),None,json!({"kind":"snapshot"}),false).unwrap();super::storage::persist_store(&mut refdb,"guest",&wrapped(&prev).to_string()).unwrap();
 for step in f["steps"].as_array().unwrap(){
  let next=&step["state"];let (_,_,rev)=read(&c,"guest").unwrap();let p=json!({"kind":"delta","base":rev,"patch":step["patch"]});
  persist(&mut c,"guest",&wrapped(next),None,p,false).unwrap();super::storage::persist_store(&mut refdb,"guest",&wrapped(next).to_string()).unwrap();check(&c,"guest",next);
  compare(&c,&refdb,"guest");prev=next.clone();
 }
 // Fallback and isolation.
 let mut next=prev.clone();next["theme"]=json!("light");
 let (_,_,rev)=read(&c,"guest").unwrap();persist(&mut c,"guest",&wrapped(&next),None,json!({"kind":"snapshot","base":rev}),false).unwrap();check(&c,"guest",&next);
 let other="00000000-0000-4000-8000-000000000001";persist(&mut c,other,&wrapped(&prev),None,json!({"kind":"snapshot"}),false).unwrap();check(&c,other,&prev);check(&c,"guest",&next);
 println!("shared domain steps={} plus fallback/scope verified",f["steps"].as_array().unwrap().len());
}
pub(super) fn compare(a:&Connection,b:&Connection,s:&str){
 // Compare actual stored history bodies, FTS and backups, not just row hashes.
 for sql in ["SELECT body FROM operation_history WHERE scope=?1 ORDER BY version","SELECT json_array(task_id,title,notes) FROM task_search WHERE scope=?1 ORDER BY task_id","SELECT body FROM backups WHERE scope=?1 ORDER BY saved_at","SELECT body FROM workspace_store WHERE scope=?1"]{
  let rows=|c:&Connection|{let mut q=c.prepare(sql).unwrap();q.query_map([s],|r|r.get::<_,String>(0)).unwrap().collect::<Result<Vec<_>,_>>().unwrap()};
  assert_eq!(rows(a),rows(b),"{sql}");
 }
 let h=|c:&Connection|c.query_row("SELECT version,fingerprint FROM operation_history_head WHERE scope=?1",[s],|r|Ok((r.get::<_,i64>(0)?,r.get::<_,String>(1)?))).optional().unwrap();
 assert_eq!(h(a),h(b));
}
#[test]fn mismatch_rolls_back_authoritative_transaction(){
 let mut c=db();let a=json!({"version":2,"tasks":[{"id":"a","title":"synthetic","priority":0}]});
 persist(&mut c,"guest",&wrapped(&a),None,json!({"kind":"snapshot"}),false).unwrap();
 let mut b=a.clone();b["tasks"][0]["priority"]=json!(3);
 let p=delta(&c,"guest",&a,&b);assert!(persist(&mut c,"guest",&wrapped(&b),None,p.clone(),true).is_err());check(&c,"guest",&a);
 let mut bad=p.clone();bad["patch"]["put"]=json!([]);assert!(persist(&mut c,"guest",&wrapped(&b),None,bad,false).unwrap_err().contains("integrity"));check(&c,"guest",&a);
 persist(&mut c,"guest",&wrapped(&b),None,p.clone(),false).unwrap();check(&c,"guest",&b);
 assert!(persist(&mut c,"guest",&wrapped(&b),None,p,false).unwrap_err().contains("stale base"));check(&c,"guest",&b);
 // An uninstrumented old writer cannot be silently overwritten by fallback.
 super::storage::persist_store(&mut c,"guest",&wrapped(&a).to_string()).unwrap();
 assert!(persist(&mut c,"guest",&wrapped(&b),None,json!({"kind":"snapshot","base":1}),false).unwrap_err().contains("authority diverged"));
 assert_eq!(c.query_row("SELECT body FROM snapshots WHERE scope='guest'",[],|r|r.get::<_,String>(0)).unwrap(),a.to_string());
}


#[test]#[ignore]fn shadow_cost_matrix(){
 use std::time::Instant;
 fn stats(v:&mut [f64])->String{v.sort_by(|a,b|a.total_cmp(b));let n=v.len();format!("{:.3}/{:.3}/{:.3}",(v[(n-1)/2]+v[n/2])/2.,v[((n as f64*0.95).ceil() as usize)-1],v[n-1])}
 for (n,samples) in [(1000,30),(10000,30)]{
  let dir=std::env::temp_dir().join(format!("todo-shadow-{}",uuid::Uuid::new_v4()));std::fs::create_dir(&dir).unwrap();
  let mut a=Connection::open(dir.join("full.sqlite3")).unwrap();let mut b=Connection::open(dir.join("shadow.sqlite3")).unwrap();
  for c in [&a,&b]{super::storage::schema(c).unwrap();c.execute_batch("PRAGMA wal_autocheckpoint=0").unwrap();}
  schema(&b).unwrap();
  let mut state=json!({"version":2,"tasks":(0..n).map(|i|json!({"id":format!("qa-{i}"),"title":format!("synthetic {i}"),"notes":"synthetic","priority":0,"activity":(0..5).map(|j|json!({"id":format!("qa-{i}-{j}"),"category":"property","kind":"priority","changes":[{"field":"priority","before":"0","after":"1"}]})).collect::<Vec<_>>() })).collect::<Vec<_>>()});
  super::storage::persist_store(&mut a,"guest",&wrapped(&state).to_string()).unwrap();persist(&mut b,"guest",&wrapped(&state),None,json!({"kind":"snapshot"}),false).unwrap();
  for c in [&a,&b]{c.execute_batch("PRAGMA wal_checkpoint(TRUNCATE)").unwrap();}
  let mut full=vec![];let mut shadow=vec![];
  for i in 0..samples{
   let old=state["tasks"][i].clone();state["tasks"][i]["priority"]=json!(3);
   let t=Instant::now();super::storage::persist_store(&mut a,"guest",&wrapped(&state).to_string()).unwrap();full.push(t.elapsed().as_secs_f64()*1000.);
   let t=Instant::now();let p=json!({"kind":"delta","base":i,"patch":{"put":[{"id":old["id"],"before":old,"after":state["tasks"][i]}],"remove":[],"order":null,"meta":null}});
   persist(&mut b,"guest",&wrapped(&state),None,p,false).unwrap();shadow.push(t.elapsed().as_secs_f64()*1000.);
   check(&b,"guest",&state);compare(&a,&b,"guest");
  }
  let wal=|name:&str|std::fs::metadata(dir.join(name)).unwrap().len();
  println!("shadow_matrix tasks={n} samples={samples} full_ms={} full_plus_shadow_ms={} full_wal={} shadow_wal={}",stats(&mut full),stats(&mut shadow),wal("full.sqlite3-wal"),wal("shadow.sqlite3-wal"));
  for c in [&a,&b]{assert_eq!(c.query_row("PRAGMA integrity_check",[],|r|r.get::<_,String>(0)).unwrap(),"ok");}
  drop((a,b));std::fs::remove_dir_all(dir).unwrap();
 }
}


#[test]fn metadata_and_legacy_drift(){
 let mut c=db();let a=json!({"version":2,"tasks":[{"id":"a","title":"synthetic"}]});let original=wrapped(&a);
 persist(&mut c,"guest",&original,None,json!({"kind":"snapshot"}),false).unwrap();
 let mut edited=original.clone();edited["todo-cloud-base"]=json!("synthetic base");edited["todo-workbench-backup"]=json!(a.to_string());
 let p=delta(&c,"guest",&a,&a);persist(&mut c,"guest",&edited,None,p,false).unwrap();
 let (state,keys,rev)=read(&c,"guest").unwrap();assert_eq!(state,a);assert_eq!(keys,kv(&edited).unwrap());assert_eq!(rev,1);
 edited.as_object_mut().unwrap().remove("todo-cloud-base");
 let p=delta(&c,"guest",&a,&a);persist(&mut c,"guest",&edited,None,p,false).unwrap();assert_eq!(read(&c,"guest").unwrap().1,kv(&edited).unwrap());
 // Same task snapshot but an old writer changed cloud metadata: reject.
 super::storage::persist_store(&mut c,"guest",&original.to_string()).unwrap();
 let p=delta(&c,"guest",&a,&a);assert!(persist(&mut c,"guest",&edited,None,p,false).unwrap_err().contains("authority diverged"));
 // Even a matching authority cannot hide a damaged independent metadata row.
 c.execute("UPDATE shadow_kv SET body='corrupt' WHERE scope='guest' AND key='todo-cloud-meta'",[]).unwrap();assert!(read(&c,"guest").is_err());
}

#[test]#[ignore]fn shadow_retention_checkpoint_restart(){
 use std::time::Instant;
 let dir=std::env::temp_dir().join(format!("todo-shadow-retain-{}",uuid::Uuid::new_v4()));std::fs::create_dir(&dir).unwrap();
 let path=dir.join("shadow.sqlite3");let mut c=Connection::open(&path).unwrap();super::storage::schema(&c).unwrap();schema(&c).unwrap();
 let mut state=json!({"version":2,"tasks":(0..1000).map(|i|json!({"id":format!("qa-{i}"),"title":format!("synthetic {i}"),"priority":0,"activity":[]})).collect::<Vec<_>>()});
 persist(&mut c,"guest",&wrapped(&state),None,json!({"kind":"snapshot"}),false).unwrap();
 let mut ms=vec![];
 for i in 0..320{
  let old=state["tasks"][i].clone();state["tasks"][i]["priority"]=json!(3);
  let p=json!({"kind":"delta","base":i,"patch":{"put":[{"id":old["id"],"before":old,"after":state["tasks"][i]}],"remove":[],"order":null,"meta":null}});
  let start=Instant::now();persist(&mut c,"guest",&wrapped(&state),None,p,false).unwrap();ms.push(start.elapsed().as_secs_f64()*1000.);
  if i%40==39{check(&c,"guest",&state);let wal=std::fs::metadata(dir.join("shadow.sqlite3-wal")).map(|m|m.len()).unwrap_or(0);c.execute_batch("PRAGMA wal_checkpoint(TRUNCATE)").unwrap();drop(c);c=Connection::open(&path).unwrap();check(&c,"guest",&state);println!("checkpoint edits={} wal_before={} head={}",i+1,wal,read(&c,"guest").unwrap().2);}
 }
 assert_eq!(c.query_row("SELECT count(*) FROM operation_history WHERE scope='guest'",[],|r|r.get::<_,i64>(0)).unwrap(),300);
 assert_eq!(read(&c,"guest").unwrap().2,320);
 c.execute("VACUUM INTO ?1",[dir.join("backup.sqlite3").to_str().unwrap()]).unwrap();
 let copy=Connection::open(dir.join("backup.sqlite3")).unwrap();check(&copy,"guest",&state);compare(&copy,&c,"guest");
 assert_eq!(copy.query_row("PRAGMA integrity_check",[],|r|r.get::<_,String>(0)).unwrap(),"ok");
 ms.sort_by(|a,b|a.total_cmp(b));println!("retention samples=320 p50_ms={:.3} p95_ms={:.3} max_ms={:.3} retained=300 restart=8 backup=ok", (ms[159]+ms[160])/2.,ms[303],ms[319]);
 drop((copy,c));std::fs::remove_dir_all(dir).unwrap();
}

#[test]fn shadow_crash_child(){
 let Ok(dir)=std::env::var("TODO_R2_CRASH_DIR")else{return};
 let dir=std::path::PathBuf::from(dir);let mut c=Connection::open(dir.join("shadow.sqlite3")).unwrap();
 let (old,_,rev)=read(&c,"guest").unwrap();let mut new=old.clone();new["tasks"][0]["priority"]=json!(3);
 let p=json!({"kind":"delta","base":rev,"patch":patch(&old,&new)});
 persist(&mut c,"guest",&wrapped(&new),None,p,false).unwrap();
 std::fs::write(dir.join("committed"),b"ready").unwrap();loop{std::thread::park()}
}
#[test]#[ignore]fn shadow_crash_boundaries(){
 use std::{process::{Command,Stdio},time::{Duration,Instant}};
 let dir=std::env::temp_dir().join(format!("todo-shadow-crash-{}",uuid::Uuid::new_v4()));std::fs::create_dir(&dir).unwrap();
 let path=dir.join("shadow.sqlite3");let mut c=Connection::open(&path).unwrap();super::storage::schema(&c).unwrap();schema(&c).unwrap();
 let before=json!({"version":2,"tasks":[{"id":"a","title":"synthetic","priority":0}]});let mut after=before.clone();after["tasks"][0]["priority"]=json!(3);
 persist(&mut c,"guest",&wrapped(&before),None,json!({"kind":"snapshot"}),false).unwrap();drop(c);
 for pre in [true,false]{
  let marker=dir.join(if pre{"precommit"}else{"committed"});
  let mut cmd=Command::new(std::env::current_exe().unwrap());cmd.args(["incremental_shadow::shadow_crash_child","--exact","--nocapture"]).env("TODO_R2_CRASH_DIR",&dir).stdout(Stdio::null()).stderr(Stdio::null());
  if pre{cmd.env("TODO_TEST_HISTORY_PRECOMMIT_MARKER",&marker);}
  let mut child=cmd.spawn().unwrap();let start=Instant::now();
  while !marker.exists()&&start.elapsed()<Duration::from_secs(10){if child.try_wait().unwrap().is_some(){break}std::thread::sleep(Duration::from_millis(10));}
  let ready=marker.exists();let wal=std::fs::metadata(dir.join("shadow.sqlite3-wal")).map(|m|m.len()).unwrap_or(0);
  let _=child.kill();let status=child.wait().unwrap();assert!(ready&&wal>0&&!status.success(),"child boundary");
  let c=Connection::open(&path).unwrap();check(&c,"guest",if pre{&before}else{&after});
  assert_eq!(read(&c,"guest").unwrap().2,if pre{0}else{1});
  let h=super::operation_history::history_read(&c,"guest",true,300).unwrap();assert_eq!(h["head"],if pre{0}else{1});
  assert_eq!(c.query_row("PRAGMA integrity_check",[],|r|r.get::<_,String>(0)).unwrap(),"ok");
  println!("shadow crash precommit={pre} wal_bytes={wal} history_head={} integrity=ok",h["head"]);
 }
 std::fs::remove_dir_all(dir).unwrap();
}
