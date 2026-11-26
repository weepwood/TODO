// Feature-only isolated native research harness. No production app services.
use super::*;
use serde_json::{Value,json};
use std::{path::PathBuf,time::Instant,io::Write};
use sha2::{Digest,Sha256};
type R<T>=Result<T,String>;
const S:&str="guest";
const ID:&str="com.weepwood.todo.qa.r4";
const ROOT:&str="/Volumes/data/AI-Development/artifacts/TODO/incremental-native-r4-quality";
const KEY:&str="todo-workbench-v1";
struct Lab{db:Mutex<Connection>,dir:PathBuf,phase:String}
fn err(e:rusqlite::Error)->String{e.to_string()}
fn check(w:&tauri::WebviewWindow)->R<()>{if w.label()!="main"||w.app_handle().config().identifier!=ID{return Err("isolated main window only".into())}Ok(())}
fn trace(lab:&Lab,event:&str,detail:Value){
 let line=json!({"at":Local::now().to_rfc3339(),"event":event,"detail":detail}).to_string();
 if let Ok(mut f)=std::fs::OpenOptions::new().create(true).append(true).open(lab.dir.join("trace.jsonl")){let _=writeln!(f,"{line}");}
}
fn load(c:&Connection)->R<Value>{
 let rev=incremental_single::revision(c,S)?;
 let store=incremental_single::export(c,S)?;
 let raw=store[KEY].as_str().ok_or("missing body")?;
 Ok(json!({"scope":S,"revision":rev,"store":store,"fingerprint":format!("{:x}",Sha256::digest(raw.as_bytes()))}))
}
#[tauri::command]async fn r4_load(w:tauri::WebviewWindow,lab:tauri::State<'_, Lab>)->R<Option<Value>>{
 check(&w)?;let c=lab.db.lock().map_err(|e|e.to_string())?;
 if c.query_row("SELECT EXISTS(SELECT 1 FROM r3_head WHERE scope=?1)",[S],|r|r.get::<_,bool>(0)).map_err(err)?{let mut v=load(&c)?;v["phase"]=json!(lab.phase);Ok(Some(v))}else if lab.phase=="retention"{Ok(Some(json!({"phase":"retention","empty":true})))}else{Ok(None)}
}
#[tauri::command]async fn r4_seed(w:tauri::WebviewWindow,lab:tauri::State<'_, Lab>,state:Value)->R<Value>{
 check(&w)?;let mut c=lab.db.lock().map_err(|e|e.to_string())?;
 if c.query_row("SELECT EXISTS(SELECT 1 FROM r3_head UNION ALL SELECT 1 FROM snapshots)",[],|r|r.get::<_,bool>(0)).map_err(err)?{return Err("already seeded; never reset".into())}
 let ts=state["tasks"].as_array().ok_or("tasks")?;
 if ts.len()>10020||ts.iter().any(|t|!t["id"].as_str().is_some_and(|id|id.starts_with("qa-"))){return Err("synthetic only".into())}
 let store=incremental_single::wrap(&state,&json!({"todo-cloud-meta":"synthetic","todo-cloud-base":"opaque qa"}));
 storage::persist_store(&mut c,S,&store.to_string())?;
 // Fixed synthetic QA consent, not actual human authorization.
 cli::bind(&c,S)?;cli::set_advanced(&c,S,true)?;
 incremental_single::migrate(&mut c,S,&store,false)?;load(&c)
}
#[tauri::command]async fn r4_commit(w:tauri::WebviewWindow,lab:tauri::State<'_, Lab>,envelope:Value,fault:Option<String>)->R<Value>{
 check(&w)?;let obj=envelope.as_object().ok_or("envelope")?;
 if obj.len()!=5||!["scope","base","id","patch","receipt"].iter().all(|k|obj.contains_key(*k))||envelope["scope"]!=S{return Err("invalid envelope".into())}
 let id=envelope["id"].as_str().ok_or("id")?;let base=envelope["base"].as_i64().ok_or("base")?;
 let r=envelope.get("receipt").filter(|v|!v.is_null());
 let mut c=lab.db.lock().map_err(|e|e.to_string())?;
 if fault.as_deref().is_some_and(|s|!["before","lost"].contains(&s)){return Err("unknown fault".into())}
 trace(&lab,"commit-begin",json!({"id":id,"base":base}));let t=Instant::now();
 let result=incremental_single::commit(&mut c,S,id,base,&envelope["patch"],r,fault.as_deref()==Some("before"));
 trace(&lab,"commit-end",json!({"id":id,"ok":result.is_ok(),"ms":t.elapsed().as_secs_f64()*1000.}));let (rev,hash)=result?;
 if fault.as_deref()==Some("lost"){return Err("QA response lost after commit".into())}
 Ok(json!({"scope":S,"id":id,"revision":rev,"fingerprint":hash,"nativeMs":t.elapsed().as_secs_f64()*1000.}))
}
#[tauri::command]async fn r4_journal(w:tauri::WebviewWindow,lab:tauri::State<'_, Lab>)->R<Value>{check(&w)?;incremental_single::journal(&*lab.db.lock().map_err(|e|e.to_string())?,S)}
#[tauri::command]fn r4_enqueue(w:tauri::WebviewWindow,lab:tauri::State<'_, Lab>,id:String,request:Value)->R<Value>{
 check(&w)?;if uuid::Uuid::parse_str(&id).is_err()||!matches!(request["op"].as_str(),Some("history-preview"|"history-apply"|"update")){return Err("QA request only".into())}
 cli::enqueue_operation(&mut *lab.db.lock().map_err(|e|e.to_string())?,S,&id,request)
}
#[tauri::command]fn r4_receipt(w:tauri::WebviewWindow,lab:tauri::State<'_, Lab>,id:String)->R<Value>{
 check(&w)?;cli::receipt(&*lab.db.lock().map_err(|e|e.to_string())?,S,&id)
}
#[tauri::command]async fn r4_checkpoint(w:tauri::WebviewWindow,lab:tauri::State<'_, Lab>)->R<Value>{
 check(&w)?;let c=lab.db.lock().map_err(|e|e.to_string())?;
 c.execute_batch("PRAGMA wal_checkpoint(TRUNCATE)").map_err(err)?;
 let v=load(&c)?;let j=incremental_single::journal(&c,S)?;
 let check:String=c.query_row("PRAGMA integrity_check",[],|r|r.get(0)).map_err(err)?;
 let snapshots:i64=c.query_row("SELECT (SELECT count(*) FROM snapshots)+(SELECT count(*) FROM workspace_store)",[],|r|r.get(0)).map_err(err)?;
 let n:i64=c.query_row("SELECT count(*) FROM r3_ack",[],|r|r.get(0)).map_err(err)?;
 Ok(json!({"revision":v["revision"],"fingerprint":v["fingerprint"],"history":j["head"],"integrity":check,"snapshots":snapshots,"acks":n}))
}
#[tauri::command]fn r4_report(w:tauri::WebviewWindow,lab:tauri::State<'_, Lab>,report:Value,phase:String)->R<()>{
 check(&w)?;if !["first","restart","fast","error","quality","perf","retention","progress"].contains(&phase.as_str()){return Err("invalid phase".into())}
 if phase=="progress"{trace(&lab,"webview",report);return Ok(())}
 let path=lab.dir.join(format!("{phase}.json"));let raw=report.to_string();if raw.len()>500000{return Err("report budget".into())}
 std::fs::write(path,raw).map_err(|e|e.to_string())
}
pub fn run_r4(){
 tauri::Builder::default().invoke_handler(tauri::generate_handler![r4_load,r4_seed,r4_commit,r4_journal,r4_enqueue,r4_receipt,r4_checkpoint,r4_report])
 .setup(|app|{
  if app.config().identifier!=ID{return Err("R4 requires isolated bundle configuration".into())}
  let dir=std::fs::canonicalize(std::env::var("TODO_R4_RUN_DIR")?)?;
  let root=std::fs::canonicalize(ROOT)?;
  if dir.parent()!=Some(root.as_path())||!matches!(dir.file_name().and_then(|s|s.to_str()),Some("run"|"small")){return Err("R4 dedicated path required".into())}
  let path=dir.join("r4-research.sqlite3");
  if path.is_symlink()||dir.join("r4-research.sqlite3-wal").is_symlink()||dir.join("r4-research.sqlite3-shm").is_symlink(){return Err("symlinks forbidden".into())}
  let fresh=!path.exists();
  #[cfg(unix)] if !fresh{use std::os::unix::fs::MetadataExt;if std::fs::metadata(&path)?.nlink()!=1{return Err("hard-linked DB forbidden".into())}}
  let c=Connection::open(path)?;c.execute_batch("PRAGMA foreign_keys=ON")?;
  if fresh{incremental_single::schema(&c)?;}else{
   let exists:bool=c.query_row("SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name='r3_head')",[],|r|r.get(0))?;
   if !exists{return Err("not an R4 database".into())}
  }
  let phase=std::env::var("TODO_R4_PHASE").unwrap_or_else(|_|"normal".into());if !["normal","quality","perf","retention"].contains(&phase.as_str()){return Err("invalid research phase".into())}
  if (phase=="retention")!=(dir.file_name().and_then(|s|s.to_str())==Some("small")){return Err("phase/directory mismatch".into())}
  app.manage(Lab{db:Mutex::new(c),dir,phase});Ok(())
 }).run(tauri::generate_context!()).expect("R4 isolated harness failed");
}
