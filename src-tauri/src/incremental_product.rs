// R5 product UI research only. No production app services or database discovery.
use super::*;
use serde_json::{Value,json};
use sha2::{Digest,Sha256};
use std::{path::PathBuf,time::Instant,io::Write};
type R<T>=Result<T,String>;
const S:&str="guest";
const ROOT:&str="/Volumes/data/AI-Development/artifacts/TODO/incremental-product-r5";
const ID:&str="com.weepwood.todo.qa.r5";
const KEY:&str="todo-workbench-v1";
struct Lab{row:bool,dir:PathBuf,phase:String}
fn err(e:rusqlite::Error)->String{e.to_string()}
fn guard(w:&tauri::WebviewWindow,scope:&str)->R<()>{
 if w.label()!="main"||w.app_handle().config().identifier!=ID||scope!=S{return Err("isolated guest only".into())}Ok(())
}
fn raw(c:&Connection,row:bool)->R<String>{
 if row{Ok(incremental_single::export(c,S)?.to_string())}else{c.query_row("SELECT body FROM workspace_store WHERE scope='guest'",[],|r|r.get(0)).map_err(err)}
}
fn trace(l:&Lab,v:Value){if let Ok(mut f)=std::fs::OpenOptions::new().create(true).append(true).open(l.dir.join("writes.jsonl")){let _=writeln!(f,"{}",v.to_string());}}
#[tauri::command]async fn native_load_store(w:tauri::WebviewWindow,scope:String,lab:tauri::State<'_,Lab>,db:tauri::State<'_,Database>)->R<Option<String>>{
 guard(&w,&scope)?;let c=db.0.lock().map_err(|e|e.to_string())?;Ok(Some(raw(&c,lab.row)?))
}
#[tauri::command]fn native_activate(w:tauri::WebviewWindow,scope:Option<String>,active:tauri::State<ActiveScope>)->R<()>{
 guard(&w,scope.as_deref().unwrap_or(S))?;*active.0.lock().map_err(|e|e.to_string())?=scope;Ok(())
}
#[tauri::command]async fn native_operation_history(w:tauri::WebviewWindow,scope:String,detail:bool,version:Option<i64>,lab:tauri::State<'_,Lab>,db:tauri::State<'_,Database>)->R<Value>{
 guard(&w,&scope)?;let c=db.0.lock().map_err(|e|e.to_string())?;
 if lab.row{incremental_single::journal_selected(&c,S,detail,version)}else{match version{Some(v) if detail=>operation_history::history_read_version(&c,S,v),Some(_)=>Err("version requires detail".into()),None=>operation_history::history_read(&c,S,detail,300)}}
}
#[tauri::command]fn r5_handshake(w:tauri::WebviewWindow,lab:tauri::State<Lab>,db:tauri::State<Database>)->R<Value>{
 guard(&w,S)?;let c=db.0.lock().map_err(|e|e.to_string())?;
 Ok(json!({"protocol":1,"scope":S,"phase":lab.phase,"mode":if lab.row{"row"}else{"snapshot"},"revision":if lab.row{incremental_single::revision(&c,S)?}else{0}}))
}
#[tauri::command]async fn r5_commit(w:tauri::WebviewWindow,envelope:Value,lab:tauri::State<'_,Lab>,db:tauri::State<'_,Database>,active:tauri::State<'_,ActiveScope>)->R<Value>{
 guard(&w,S)?;if active.0.lock().map_err(|e|e.to_string())?.as_deref()!=Some(S){return Err("inactive workspace".into())}
 let id=envelope["id"].as_str().filter(|id|uuid::Uuid::parse_str(id).is_ok()).ok_or("request id")?;
 if envelope["protocol"]!=1||envelope["scope"]!=S||envelope["mode"]!=if lab.row{"row"}else{"snapshot"}{return Err("protocol mismatch".into())}
 let expected=if lab.row{"patch"}else{"store"};
 let object=envelope.as_object().ok_or("invalid envelope")?;
 if object.len()!=7||!["protocol","scope","mode","id","base","receipt",expected].iter().all(|k|object.contains_key(*k)){return Err("unexpected envelope fields".into())}
 let receipt=envelope.get("receipt").filter(|v|!v.is_null());
 let mut c=db.0.lock().map_err(|e|e.to_string())?;let t=Instant::now();
 let (rev,hash)=if lab.row{
  incremental_single::commit(&mut c,S,id,envelope["base"].as_i64().ok_or("base")?,&envelope["patch"],receipt,false)?
 }else{
  let store=envelope["store"].as_str().ok_or("store")?;
  storage::persist_store_receipt(&mut c,S,store,receipt)?;
  let requested:Value=serde_json::from_str(store).map_err(|e|e.to_string())?;
  let saved:Value=serde_json::from_str(&raw(&c,false)?).map_err(|e|e.to_string())?;
  if saved!=requested{return Err("snapshot acknowledgement differs from committed store; reload authority".into())}
  (0,format!("{:x}",Sha256::digest(saved[KEY].as_str().ok_or("body")?.as_bytes())))
 };
 trace(&lab,json!({"id":id,"revision":rev,"nativeMs":t.elapsed().as_secs_f64()*1000.,"bytes":envelope.to_string().len(),"receipt":receipt.map(|v|&v["id"])}));
 Ok(json!({"id":id,"scope":S,"revision":rev,"fingerprint":hash}))
}
#[tauri::command]fn r5_enqueue(w:tauri::WebviewWindow,id:String,request:Value,db:tauri::State<Database>)->R<Value>{
 guard(&w,S)?;if !matches!(request["op"].as_str(),Some("update"|"create"|"history-preview"|"history-apply"|"focus-start"|"focus-change"|"complete"|"reopen"|"entity-create")){return Err("synthetic QA request only".into())}
 cli::enqueue_operation(&mut *db.0.lock().map_err(|e|e.to_string())?,S,&id,request)
}
#[tauri::command]fn r5_receipt(w:tauri::WebviewWindow,id:String,db:tauri::State<Database>)->R<Value>{guard(&w,S)?;cli::receipt(&*db.0.lock().map_err(|e|e.to_string())?,S,&id)}
#[tauri::command]fn r5_report(w:tauri::WebviewWindow,report:Value,lab:tauri::State<Lab>)->R<()>{
 guard(&w,S)?;let data=report.to_string();if data.len()>200000{return Err("report budget".into())}
 if report["phase"]=="progress"{if let Ok(mut f)=std::fs::OpenOptions::new().create(true).append(true).open(lab.dir.join("stages.jsonl")){writeln!(f,"{data}").map_err(|e|e.to_string())?;}return Ok(())}
 std::fs::write(lab.dir.join("report.json"),data).map_err(|e|e.to_string())
}
pub fn run_r5(){
 tauri::Builder::default().invoke_handler(tauri::generate_handler![native_load_store,native_activate,native_operation_history,r5_handshake,r5_commit,r5_enqueue,r5_receipt,r5_report,super::native_cli_next,super::native_direct_pending,super::native_take_quick_capture,super::native_shortcut_status,super::native_search,super::native_cli_binding,super::native_list_backups,super::native_read_backup])
 .setup(|app|{
  if app.config().identifier!=ID{return Err("requires R5 isolated bundle".into())}
  let root=PathBuf::from(ROOT);let dir=std::fs::canonicalize(std::env::var("TODO_R5_RUN_DIR")?)?;
  if dir.parent()!=Some(root.as_path())||!matches!(dir.file_name().and_then(|x|x.to_str()),Some("row"|"snapshot")){return Err("dedicated R5 directory required".into())}
  let row=dir.ends_with("row");let path=dir.join("r5-research.sqlite3");
  for p in [&path,&dir.join("r5-research.sqlite3-wal"),&dir.join("r5-research.sqlite3-shm")]{if p.is_symlink(){return Err("symlink forbidden".into())}
   #[cfg(unix)] if p.exists(){use std::os::unix::fs::MetadataExt;if std::fs::metadata(p)?.nlink()!=1{return Err("hard link forbidden".into())}}
  }
  let fresh=!path.exists();let mut c=Connection::open(path)?;
  if fresh{
   if row{incremental_single::schema(&c)?;}else{storage::schema(&c)?;}
   let state:Value=serde_json::from_str(&std::fs::read_to_string(root.join("fixture.json"))?)?;
   if state["tasks"].as_array().is_none_or(|a|a.len()>10000||a.iter().any(|t|!t["id"].as_str().is_some_and(|x|x.starts_with("qa-")))){return Err("synthetic fixture only".into())}
   let store=incremental_single::wrap(&state,&json!({}));storage::persist_store(&mut c,S,&store.to_string())?;
   cli::bind(&c,S)?;cli::set_advanced(&c,S,true)?;
   if row{incremental_single::migrate(&mut c,S,&store,false)?;}
  }else{
   let marker:bool=c.query_row("SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name='r3_head')",[],|r|r.get(0))?;
   if marker!=row{return Err("storage mode mismatch".into())}
   raw(&c,row)?;
  }
  app.manage(Database(Mutex::new(c)));app.manage(ActiveScope(Mutex::new(None)));
  app.manage(QuickCapture(Mutex::new(CaptureState::default())));app.manage(ShortcutStatus(Mutex::new("research".into())));
  let phase=std::env::var("TODO_R5_PHASE").unwrap_or_else(|_|"test".into());if !["test","restart","business","automation"].contains(&phase.as_str()){return Err("invalid phase".into())}
  app.manage(Lab{row,dir,phase});Ok(())
 }).run(tauri::generate_context!()).expect("R5 isolated native setup");
}
