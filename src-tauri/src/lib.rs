use std::sync::Mutex;
#[cfg(desktop)] use std::time::Duration;
use chrono::Local;
use rusqlite::{params, Connection, OptionalExtension};
use tauri::{Emitter, Manager};
#[cfg(desktop)] mod desktop;
#[cfg(desktop)] use desktop::{reset_capture_window,request_quick_capture};
#[cfg(mobile)] mod mobile;
#[cfg(mobile)] use mobile::{reset_capture_window,request_quick_capture};
use tauri_plugin_notification::NotificationExt;

mod storage;
use storage::*;
struct Database(Mutex<Connection>);
struct ActiveScope(Mutex<Option<String>>);
// The secondary window owns no workspace. It can hand a bounded draft to the
// main window only while the same active scope and capture generation remain valid.
#[derive(Clone,serde::Serialize)]
struct DirectCapture{scope:String,generation:u64,id:String,text:String,saved:bool,created_at:i64}
#[derive(Default,Clone)]
struct CaptureState{generation:u64,scope:Option<String>,pending:Option<(String,String)>,open_main:bool,direct:Option<DirectCapture>}
impl CaptureState{
 fn begin(&mut self,scope:&str)->u64{self.generation=self.generation.wrapping_add(1);self.scope=Some(scope.into());self.direct=None;self.generation}
 fn invalidate(&mut self){self.generation=self.generation.wrapping_add(1);self.scope=None;self.pending=None;self.open_main=false;self.direct=None}
 fn handoff(&mut self,scope:&str,generation:u64,text:&str)->Result<(),String>{
  let text=text.trim();
  if self.scope.as_deref()!=Some(scope)||self.generation!=generation{return Err("录入会话已失效，请重新打开".into())}
  if text.is_empty()||text.chars().count()>500{return Err("请输入 1–500 字的任务草稿".into())}
  if self.pending.is_some()||self.direct.is_some(){return Err("主窗口尚有待确认请求".into())}
  self.pending=Some((scope.into(),text.into()));self.scope=None;Ok(())
 }
 fn submit_direct(&mut self,scope:&str,generation:u64,id:&str,text:&str)->Result<(),String>{
  let text=text.trim();
  if self.scope.as_deref()!=Some(scope)||self.generation!=generation{return Err("录入会话已失效".into())}
  if id.len()!=36||!id.bytes().enumerate().all(|(i,b)|if [8,13,18,23].contains(&i){b==b'-'}else{b.is_ascii_hexdigit()})||text.is_empty()||text.chars().count()>500{return Err("无效录入请求".into())}
  if let Some(d)=&self.direct{if d.id==id&&d.text==text&&d.generation==generation{return Ok(())}return Err("已有录入请求，请等待保存结果".into())}
  if self.pending.is_some(){return Err("已有待确认草稿".into())}
  self.direct=Some(DirectCapture{scope:scope.into(),generation,id:id.into(),text:text.into(),saved:false,created_at:Local::now().timestamp()});Ok(())
 }

 fn take(&mut self,scope:&str)->Option<String>{
  if self.pending.as_ref().is_some_and(|(owner,_)|owner==scope){self.open_main=false;return self.pending.take().map(|(_,text)|text)}
  if self.open_main{self.open_main=false;return Some(String::new())}None
 }
}
struct QuickCapture(Mutex<CaptureState>);
struct ShortcutStatus(Mutex<String>);
#[tauri::command]
fn native_take_quick_capture(scope:String,pending:tauri::State<QuickCapture>,active:tauri::State<ActiveScope>)->Result<Option<String>,String>{
 let current=active.0.lock().map_err(|e|e.to_string())?;
 if current.as_deref()!=Some(&scope){return Ok(None)}
 Ok(pending.0.lock().map_err(|e|e.to_string())?.take(&scope))
}
#[tauri::command]
fn native_shortcut_status(status:tauri::State<ShortcutStatus>)->String{status.0.lock().map(|v|v.clone()).unwrap_or_else(|_|"unknown".into())}
#[tauri::command]
fn native_open_capture(app:tauri::AppHandle){request_quick_capture(&app)}
#[tauri::command]
fn native_capture_generation(pending:tauri::State<QuickCapture>)->Option<u64>{
 let state=pending.0.lock().ok()?;state.scope.as_ref().map(|_|state.generation)
}
#[tauri::command]
fn native_capture_handoff(generation:u64,text:String,pending:tauri::State<QuickCapture>,active:tauri::State<ActiveScope>,app:tauri::AppHandle)->Result<(),String>{
 {let current=active.0.lock().map_err(|e|e.to_string())?;let scope=current.as_deref().ok_or("工作空间尚未就绪")?;
 pending.0.lock().map_err(|e|e.to_string())?.handoff(scope,generation,&text)?;}
 reset_capture_window(&app);#[cfg(desktop)] desktop::show(&app);let _=app.emit_to("main","todo-quick-add",());Ok(())
}
#[tauri::command]
fn native_capture_cancel(pending:tauri::State<QuickCapture>,app:tauri::AppHandle)->Result<(),String>{
 {let mut state=pending.0.lock().map_err(|e|e.to_string())?;if state.direct.as_ref().is_some_and(|d|!d.saved){return Err("任务正在保存，请等待结果".into())}state.invalidate();}
 reset_capture_window(&app);Ok(())
}

// Only the capture request, not the task workspace, is written by capture IPC.
// The main window consumes the durable queue; the workspace transaction owns the receipt.
fn direct_status(c:&Connection,scope:&str,id:&str)->rusqlite::Result<Option<String>>{
 c.query_row("SELECT status FROM direct_capture_requests WHERE scope=?1 AND id=?2",params![scope,id],|r|r.get(0)).optional()
}
fn enqueue_direct(c:&Connection,d:&DirectCapture)->Result<(),String>{
 let existing:Option<(i64,String,String)>=c.query_row("SELECT generation,text,status FROM direct_capture_requests WHERE scope=?1 AND id=?2",params![d.scope,d.id],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).optional().map_err(|e|e.to_string())?;
 if let Some((g,text,status))=existing{return if g==d.generation as i64&&(status!="pending"||text==d.text){Ok(())}else{Err("录入请求标识冲突".into())}}
 if direct_task_exists(c,&d.scope,&d.id).map_err(|e|e.to_string())?{return Err("任务标识已存在".into())}
 c.execute("INSERT INTO direct_capture_requests(scope,id,generation,text,status,created_at) VALUES(?1,?2,?3,?4,'pending',?5)",params![d.scope,d.id,d.generation as i64,d.text,d.created_at]).map_err(|e|e.to_string())?;
 Ok(())
}
fn pending_direct(c:&Connection,scope:&str)->rusqlite::Result<Option<DirectCapture>>{
 c.query_row("SELECT scope,generation,id,text,created_at FROM direct_capture_requests WHERE scope=?1 AND status='pending' ORDER BY created_at,id LIMIT 1",[scope],|r|Ok(DirectCapture{scope:r.get(0)?,generation:r.get::<_,i64>(1)? as u64,id:r.get(2)?,text:r.get(3)?,saved:false,created_at:r.get(4)?})).optional()
}
fn cancel_direct(c:&Connection,scope:&str,id:&str)->rusqlite::Result<bool>{
 Ok(c.execute("UPDATE direct_capture_requests SET status='cancelled',text='' WHERE scope=?1 AND id=?2 AND status='pending'",params![scope,id])?==1)
}
#[tauri::command]
fn native_capture_submit_direct(generation:u64,id:String,text:String,pending:tauri::State<QuickCapture>,active:tauri::State<ActiveScope>,db:tauri::State<Database>)->Result<(),String>{
 let current=active.0.lock().map_err(|e|e.to_string())?;let scope=current.as_deref().ok_or("工作空间尚未就绪")?;
 let mut state=pending.0.lock().map_err(|e|e.to_string())?;let mut proposed=state.clone();proposed.submit_direct(scope,generation,&id,&text)?;
 let c=db.0.lock().map_err(|e|e.to_string())?;enqueue_direct(&c,proposed.direct.as_ref().ok_or("录入请求不存在")?)?;*state=proposed;Ok(())
}
#[tauri::command]
fn native_capture_direct_status(generation:u64,pending:tauri::State<QuickCapture>,db:tauri::State<Database>)->String{
 let Ok(mut state)=pending.0.lock()else{return "unavailable".into()};if state.generation!=generation||state.scope.is_none(){return "expired".into()}
 let Some(d)=state.direct.as_mut()else{return "idle".into()};
 let Ok(c)=db.0.lock()else{return "unavailable".into()};
 match direct_status(&c,&d.scope,&d.id){Ok(Some(status))=>{d.saved=status!="pending";status},_=>"unavailable".into()}
}
#[tauri::command]
fn native_direct_pending(scope:String,active:tauri::State<ActiveScope>,db:tauri::State<Database>)->Result<Option<DirectCapture>,String>{
 let current=active.0.lock().map_err(|e|e.to_string())?;if current.as_deref()!=Some(&scope){return Ok(None)}
 let c=db.0.lock().map_err(|e|e.to_string())?;pending_direct(&c,&scope).map_err(|e|e.to_string())
}
#[tauri::command]
fn native_direct_ack(scope:String,generation:u64,id:String,active:tauri::State<ActiveScope>,db:tauri::State<Database>)->Result<bool,String>{
 let current=active.0.lock().map_err(|e|e.to_string())?;if current.as_deref()!=Some(&scope){return Ok(false)}
 let c=db.0.lock().map_err(|e|e.to_string())?;
 c.query_row("SELECT EXISTS(SELECT 1 FROM direct_capture_requests WHERE scope=?1 AND id=?2 AND generation=?3 AND status='saved')",params![scope,id,generation as i64],|r|r.get(0)).map_err(|e|e.to_string())
}
#[tauri::command]
fn native_direct_cancel_pending(scope:String,id:String,active:tauri::State<ActiveScope>,db:tauri::State<Database>)->Result<bool,String>{
 let current=active.0.lock().map_err(|e|e.to_string())?;if current.as_deref()!=Some(&scope){return Ok(false)}
 let c=db.0.lock().map_err(|e|e.to_string())?;cancel_direct(&c,&scope,&id).map_err(|e|e.to_string())
}

fn direct_task_exists(c:&Connection,scope:&str,id:&str)->rusqlite::Result<bool>{
 c.query_row("SELECT EXISTS(SELECT 1 FROM snapshots,json_each(body,'$.tasks') WHERE scope=?1 AND json_extract(value,'$.id')=?2)",params![scope,id],|r|r.get(0))
}

#[derive(serde::Serialize)]
struct BackupInfo { saved_at:i64, bytes:i64 }
#[tauri::command]
fn native_list_backups(scope:String,db:tauri::State<Database>)->Result<Vec<BackupInfo>,String>{
 if !valid_scope(&scope){return Err("invalid scope".into())}
 let c=db.0.lock().map_err(|e|e.to_string())?;
 let mut stmt=c.prepare("SELECT saved_at,length(CAST(body AS BLOB)) FROM backups WHERE scope=?1 ORDER BY saved_at DESC LIMIT 24").map_err(|e|e.to_string())?;
 stmt.query_map([scope],|r|Ok(BackupInfo{saved_at:r.get(0)?,bytes:r.get(1)?})).map_err(|e|e.to_string())?.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())
}
#[tauri::command]
fn native_read_backup(scope:String,saved_at:i64,db:tauri::State<Database>)->Result<Option<String>,String>{
 if !valid_scope(&scope){return Err("invalid scope".into())}
 db.0.lock().map_err(|e|e.to_string())?.query_row("SELECT body FROM backups WHERE scope=?1 AND saved_at=?2",params![scope,saved_at],|r|r.get(0)).optional().map_err(|e|e.to_string())
}
#[tauri::command]
fn native_create_backup(scope:String,db:tauri::State<Database>)->Result<(),String>{
 let mut c=db.0.lock().map_err(|e|e.to_string())?;create_backup(&mut c,&scope)
}
#[tauri::command]
fn native_load(scope:String,db:tauri::State<Database>)->Result<Option<String>,String>{
 if !valid_scope(&scope){return Err("invalid scope".into())}
 db.0.lock().map_err(|e|e.to_string())?.query_row("SELECT body FROM snapshots WHERE scope=?1",[scope],|r|r.get(0)).optional().map_err(|e|e.to_string())
}
#[tauri::command]
fn native_save(scope:String,body:String,db:tauri::State<Database>)->Result<(),String>{let mut conn=db.0.lock().map_err(|e|e.to_string())?;save(&mut conn,&scope,&body)}
#[tauri::command]
fn native_load_store(scope:String,db:tauri::State<Database>)->Result<Option<String>,String>{
 if !valid_scope(&scope){return Err("invalid scope".into())}
 db.0.lock().map_err(|e|e.to_string())?.query_row("SELECT body FROM workspace_store WHERE scope=?1",[scope],|r|r.get(0)).optional().map_err(|e|e.to_string())
}
#[tauri::command]
fn native_write_store(scope:String,store:String,db:tauri::State<Database>)->Result<(),String>{
 let mut conn=db.0.lock().map_err(|e|e.to_string())?;
 persist_store(&mut conn,&scope,&store)
}
#[tauri::command]
fn native_activate(scope:Option<String>,active:tauri::State<ActiveScope>,pending:tauri::State<QuickCapture>,app:tauri::AppHandle)->Result<(),String>{
 if scope.as_deref().is_some_and(|s|!valid_scope(s)){return Err("invalid scope".into())}
 let changed={let mut current=active.0.lock().map_err(|e|e.to_string())?;let changed=*current!=scope;if changed{let mut capture=pending.0.lock().map_err(|e|e.to_string())?;let startup=current.is_none()&&capture.open_main;capture.invalidate();capture.open_main=startup;}*current=scope;changed};if changed{reset_capture_window(&app)}Ok(())
}
#[tauri::command]
fn native_search(scope:String,query:String,db:tauri::State<Database>)->Result<Vec<String>,String>{
 if !valid_scope(&scope){return Err("invalid scope".into())}
 let db=db.0.lock().map_err(|e|e.to_string())?;let pattern=format!("%{}%",query.replace('\\',"\\\\").replace('%',"\\%").replace('_',"\\_"));
 let long=query.chars().count()>=3;
 let term=if long{format!("\"{}\"",query.replace('"', "\"\""))}else{pattern};
 let sql=if long{"SELECT task_id FROM task_search WHERE scope=?1 AND task_search MATCH ?2 LIMIT 10000"}else{"SELECT task_id FROM task_search WHERE scope=?1 AND (title LIKE ?2 ESCAPE '\\' OR notes LIKE ?2 ESCAPE '\\') LIMIT 10000"};
 let mut stmt=db.prepare(sql).map_err(|e|e.to_string())?;
 stmt.query_map(params![scope,term],|r|r.get(0)).map_err(|e|e.to_string())?.collect::<Result<Vec<String>,_>>().map_err(|e|e.to_string())
}
#[tauri::command]
fn native_notify(scope:String,task_id:String,at:String,title:String,db:tauri::State<Database>,active:tauri::State<ActiveScope>,app:tauri::AppHandle)->Result<(),String>{
 if !valid_scope(&scope){return Err("invalid scope".into())}
 let guard=active.0.lock().map_err(|e|e.to_string())?;
 if guard.as_deref()!=Some(scope.as_str()){return Err("workspace is no longer active".into())}
 let c=db.0.lock().map_err(|e|e.to_string())?;
 let key=format!("{}:{}",task_id,at);
 match deliver_reminder(&c,&scope,&key,Local::now().timestamp(),||app.notification().builder().title("TODO").body(&title).show().map_err(|e|e.to_string()))?{true=>Ok(()),false=>Err("notification retry scheduled".into())}

}
#[tauri::command]
fn native_exit(app:tauri::AppHandle){#[cfg(desktop)] if let Some(w)=app.get_webview_window("main"){desktop::save_window(&w);}app.exit(0)}
#[tauri::command]
fn native_test_notification(app:tauri::AppHandle)->Result<(),String>{
 app.notification().builder().title("TODO").body("这是一条测试提醒。请在系统通知中心确认。").show().map_err(|e|e.to_string())
}
// Persist a bounded retry schedule before invoking the OS. Delivery is marked only
// after show() returns success. A crash between show and the SQLite commit may
// duplicate a reminder; it must not silently suppress the only attempt.
fn deliver_reminder(c:&Connection,scope:&str,key:&str,now:i64,send:impl FnOnce()->Result<(),String>)->Result<bool,String>{
 let already:bool=c.query_row("SELECT EXISTS(SELECT 1 FROM delivered WHERE scope=?1 AND reminder=?2)",params![scope,key],|r|r.get(0)).map_err(|e|e.to_string())?;
 if already{return Ok(true)}
 let retry:Option<(i64,i64)>=c.query_row("SELECT attempts,next_at FROM reminder_retry WHERE scope=?1 AND reminder=?2",params![scope,key],|r|Ok((r.get(0)?,r.get(1)?))).optional().map_err(|e|e.to_string())?;
 let (attempts,next)=retry.unwrap_or((0,0));if next>now{return Ok(false)}
 let delay=30_i64.saturating_mul(1_i64 << attempts.clamp(0,7) as u32).min(3600);
 c.execute("INSERT INTO reminder_retry VALUES(?1,?2,?3,?4) ON CONFLICT(scope,reminder) DO UPDATE SET attempts=excluded.attempts,next_at=excluded.next_at",params![scope,key,(attempts+1).min(8),now+delay]).map_err(|e|e.to_string())?;
 send()?;
 // Keep the delivered marker even if retry-row deletion later fails.
 c.execute("INSERT OR IGNORE INTO delivered VALUES(?1,?2)",params![scope,key]).map_err(|e|e.to_string())?;
 c.execute("DELETE FROM reminder_retry WHERE scope=?1 AND reminder=?2",params![scope,key]).map_err(|e|e.to_string())?;
 Ok(true)
}
// Recover a recently recorded reminder whose system delivery failed before shutdown.
fn reminder_candidates(state:&serde_json::Value,now:chrono::DateTime<Local>)->Vec<(String,String,String)>{
 let mut out=Vec::new();let Some(tasks)=state["tasks"].as_array() else{return out};
 let now_key=now.format("%Y-%m-%dT%H:%M").to_string();
 let recent=|id:&str,at:&str|state["notifications"].as_array().is_some_and(|ns|ns.iter().any(|n|{
  n["taskId"].as_str()==Some(id)&&n["reminderAt"].as_str()==Some(at)&&
  n["at"].as_str().and_then(|v|chrono::DateTime::parse_from_rfc3339(v).ok()).is_some_and(|v|{let age=now.signed_duration_since(v);age>=chrono::Duration::zero()&&age<=chrono::Duration::hours(24)})
 }));
 for t in tasks{if t["status"]!="pending"||!t["deletedAt"].is_null(){continue}
  let Some(id)=t["id"].as_str() else{continue};if id.is_empty(){continue}
  let title=t["title"].as_str().unwrap_or("任务提醒");
  let mut add=|at:&str,sent:bool|{if !at.is_empty()&&at<=now_key.as_str()&&(!sent||recent(id,at)){out.push((id.to_owned(),at.to_owned(),title.to_owned()))}};
  if let Some(at)=t["reminderAt"].as_str(){add(at,!t["remindedAt"].is_null())}
  if let Some(extra)=t["extraReminders"].as_array(){for r in extra{if let Some(at)=r["at"].as_str(){add(at,!r["sentAt"].is_null())}}}
 }
 out
}
#[cfg(desktop)]
fn schedule(app:tauri::AppHandle){
 std::thread::spawn(move||loop{
  std::thread::sleep(Duration::from_secs(5));
  let active=app.state::<ActiveScope>();let Ok(active_guard)=active.0.lock() else{continue};let Some(scope)=active_guard.clone() else{continue};
  let db=app.state::<Database>();let Ok(c)=db.0.lock() else{continue};
  let body:Option<String>=c.query_row("SELECT body FROM snapshots WHERE scope=?1",[&scope],|r|r.get(0)).optional().ok().flatten();
  let Some(body)=body else{continue};let Ok(state)=serde_json::from_str::<serde_json::Value>(&body) else{continue};
  let now=Local::now();
  let _=c.execute("DELETE FROM reminder_retry WHERE scope=?1 AND next_at<?2",params![scope,now.timestamp()-7*86400]);
  for (id,at,title) in reminder_candidates(&state,now){
   let key=format!("{}:{}",id,at);
   let _=deliver_reminder(&c,&scope,&key,Local::now().timestamp(),||app.notification().builder().title("TODO").body(&title).show().map_err(|e|e.to_string()));
  }
 });
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run(){
 let builder=tauri::Builder::default();
 #[cfg(desktop)] let builder=desktop::configure(builder);
 builder.plugin(tauri_plugin_notification::init())
 .invoke_handler(tauri::generate_handler![native_load,native_save,native_load_store,native_write_store,native_activate,native_search,native_list_backups,native_read_backup,native_create_backup,native_notify,native_exit,native_test_notification,native_take_quick_capture,native_shortcut_status,native_open_capture,native_capture_generation,native_capture_handoff,native_capture_cancel,native_capture_submit_direct,native_capture_direct_status,native_direct_pending,native_direct_ack,native_direct_cancel_pending])
 .setup(|app|{
  let path=app.path().app_data_dir()?;std::fs::create_dir_all(&path)?;let c=Connection::open(path.join("todo.sqlite3"))?;schema(&c)?;
  app.manage(Database(Mutex::new(c)));app.manage(ActiveScope(Mutex::new(None)));app.manage(QuickCapture(Mutex::new(CaptureState::default())));app.manage(ShortcutStatus(Mutex::new("not-registered".into())));
  #[cfg(desktop)] {desktop::setup(app)?;schedule(app.handle().clone());}
  Ok(())
 })

 .run(tauri::generate_context!()).expect("TODO native application failed")
}
#[cfg(test)]mod tests{
 use super::*;
 #[test]fn capture_handoff_rejects_wrong_scope_stale_generation_and_overflow(){
 let mut c=CaptureState::default();let generation=c.begin("guest");
 assert!(c.handoff("other",generation,"hello").is_err());assert!(c.handoff("guest",generation,&"x".repeat(501)).is_err());
 assert!(c.handoff("guest",generation,"   ").is_err());c.handoff("guest",generation," hello ").unwrap();
 assert!(c.handoff("guest",generation,"duplicate").is_err());assert!(c.take("other").is_none());assert_eq!(c.take("guest"),Some("hello".into()));assert!(c.take("guest").is_none());
 let generation=c.begin("guest");c.invalidate();assert!(c.handoff("guest",generation,"stale").is_err());
 }
 #[test]fn durable_capture_survives_reopen_rollback_and_removal(){
  let dir=std::env::temp_dir().join(format!("todo-capture-test-{}-{}",std::process::id(),Local::now().timestamp_nanos_opt().unwrap()));
  std::fs::create_dir(&dir).unwrap();let path=dir.join("capture.sqlite");
  let id="00000000-0000-4000-8000-000000000021";let other="00000000-0000-4000-8000-000000000001";
  let mut state=CaptureState::default();let g=state.begin("guest");state.submit_direct("guest",g,id,"test 明天").unwrap();
  let d=state.direct.as_ref().unwrap();
  {let c=Connection::open(&path).unwrap();schema(&c).unwrap();enqueue_direct(&c,d).unwrap();enqueue_direct(&c,d).unwrap();
   assert!(pending_direct(&c,other).unwrap().is_none());
   let mut second=d.clone();second.id=other.into();assert!(enqueue_direct(&c,&second).is_err());
  }
  {let mut c=Connection::open(&path).unwrap();schema(&c).unwrap();
   let pending=pending_direct(&c,"guest").unwrap().unwrap();assert_eq!(pending.text,"test 明天");assert_eq!(pending.created_at,d.created_at);
   let body=serde_json::json!({"version":2,"tasks":[{"id":id,"title":"test","notes":""}]}).to_string();
   c.execute_batch("CREATE TRIGGER qa_abort BEFORE INSERT ON workspace_store BEGIN SELECT RAISE(ABORT,'QA rollback'); END;").unwrap();
   assert!(save_with_store(&mut c,"guest",&body,Some("{}")).is_err());
   assert_eq!(direct_status(&c,"guest",id).unwrap().as_deref(),Some("pending"));assert!(!direct_task_exists(&c,"guest",id).unwrap());
   c.execute_batch("DROP TRIGGER qa_abort").unwrap();save_with_store(&mut c,"guest",&body,Some("{}")).unwrap();
   assert_eq!(direct_status(&c,"guest",id).unwrap().as_deref(),Some("saved"));
   assert_eq!(c.query_row("SELECT text FROM direct_capture_requests WHERE scope='guest' AND id=?1",[id],|r|r.get::<_,String>(0)).unwrap(),"");
  }
  {let mut c=Connection::open(&path).unwrap();schema(&c).unwrap();
   save(&mut c,"guest",r#"{"version":2,"tasks":[]}"#).unwrap();assert!(pending_direct(&c,"guest").unwrap().is_none());assert!(!direct_task_exists(&c,"guest",id).unwrap());
   enqueue_direct(&c,d).unwrap();assert!(pending_direct(&c,"guest").unwrap().is_none());assert!(!cancel_direct(&c,"guest",id).unwrap());
   let mut second=d.clone();second.id=other.into();enqueue_direct(&c,&second).unwrap();
   assert!(!cancel_direct(&c,other,other).unwrap());assert!(cancel_direct(&c,"guest",other).unwrap());
   enqueue_direct(&c,&second).unwrap();assert!(pending_direct(&c,"guest").unwrap().is_none());
   assert_eq!(direct_status(&c,"guest",other).unwrap().as_deref(),Some("cancelled"));
  }
  std::fs::remove_dir_all(&dir).unwrap();
 }
 #[test]fn direct_receipt_requires_committed_task_in_correct_scope(){
 let mut c=Connection::open_in_memory().unwrap();schema(&c).unwrap();
 let id="00000000-0000-4000-8000-000000000021";
 assert!(!direct_task_exists(&c,"guest",id).unwrap());
 let state=serde_json::json!({"version":2,"tasks":[{"id":id,"title":"test","notes":""}]}).to_string();
 save(&mut c,"guest",&state).unwrap();
 assert!(direct_task_exists(&c,"guest",id).unwrap());
 assert!(!direct_task_exists(&c,"00000000-0000-4000-8000-000000000001",id).unwrap());
 }
 #[test]fn direct_capture_retries_keep_same_identity(){
 let mut c=CaptureState::default();let g=c.begin("guest");let id="00000000-0000-4000-8000-000000000001";
 assert!(c.submit_direct("other",g,id,"test").is_err());assert!(c.submit_direct("guest",g,"invalid","test").is_err());
 c.submit_direct("guest",g,id,"test").unwrap();c.submit_direct("guest",g,id,"test").unwrap();
 assert!(c.submit_direct("guest",g,id,"different").is_err());assert!(c.handoff("guest",g,"other").is_err());
 assert!(!c.direct.as_ref().unwrap().saved);c.invalidate();assert!(c.direct.is_none());assert!(c.submit_direct("guest",g,id,"test").is_err());
 }
 #[test]fn reminder_retry_persists_backoff_and_deduplicates(){
  let c=Connection::open_in_memory().unwrap();schema(&c).unwrap();
  assert!(deliver_reminder(&c,"guest","task:at",100,||Err("test failure".into())).is_err());
  assert!(!deliver_reminder(&c,"guest","task:at",129,||panic!("must wait")).unwrap());
  assert!(deliver_reminder(&c,"guest","task:at",130,||Err("test failure".into())).is_err());
  assert!(!deliver_reminder(&c,"guest","task:at",189,||panic!("must wait")).unwrap());
  assert!(deliver_reminder(&c,"guest","task:at",190,||Ok(())).unwrap());
  assert!(deliver_reminder(&c,"guest","task:at",191,||panic!("already delivered")).unwrap());
  assert_eq!(c.query_row("SELECT count(*) FROM reminder_retry",[],|r|r.get::<_,i64>(0)).unwrap(),0);
  assert!(deliver_reminder(&c,"00000000-0000-4000-8000-000000000001","task:at",191,||Ok(())).unwrap());
 }
 #[test]fn recent_reminder_recovery_is_bounded_and_scoped_to_pending_tasks(){
  let now=Local::now();let at=(now-chrono::Duration::minutes(5)).format("%Y-%m-%dT%H:%M").to_string();
  let mut state=serde_json::json!({"tasks":[{"id":"t","title":"QA","status":"pending","deletedAt":null,"reminderAt":at,"remindedAt":now.to_rfc3339()}],"notifications":[{"taskId":"t","reminderAt":at,"at":now.to_rfc3339()}]});
  assert_eq!(reminder_candidates(&state,now).len(),1);
  state["notifications"][0]["at"]=serde_json::json!((now-chrono::Duration::hours(25)).to_rfc3339());
  assert!(reminder_candidates(&state,now).is_empty());
  state["tasks"][0]["remindedAt"]=serde_json::Value::Null;
  assert_eq!(reminder_candidates(&state,now).len(),1);
  state["tasks"][0]["status"]=serde_json::json!("completed");assert!(reminder_candidates(&state,now).is_empty());
 }

 #[test]fn sqlite_transaction_and_search(){let mut c=Connection::open_in_memory().unwrap();schema(&c).unwrap();save(&mut c,"guest",r#"{"version":2,"tasks":[{"id":"t","title":"测试任务","notes":"sqlite"}]}"#).unwrap();assert_eq!(c.query_row("SELECT count(*) FROM task_search WHERE task_search MATCH 'sqlite'",[],|r|r.get::<_,i32>(0)).unwrap(),1);assert!(save(&mut c,"guest","bad").is_err());assert_eq!(c.query_row("SELECT count(*) FROM snapshots",[],|r|r.get::<_,i32>(0)).unwrap(),1);}
 #[test]fn store_atomicity_and_scope(){
  let mut c=Connection::open_in_memory().unwrap();schema(&c).unwrap();
  let body=r#"{"version":2,"tasks":[]}"#;
  let store=serde_json::json!({"todo-workbench-v1":body,"todo-cloud-meta":"meta"}).to_string();
  persist_store(&mut c,"guest",&store).unwrap();
  assert!(persist_store(&mut c,"guest",r#"{"todo-workbench-v1":"bad"}"#).is_err());
  assert_eq!(c.query_row("SELECT body FROM workspace_store WHERE scope='guest'",[],|r|r.get::<_,String>(0)).unwrap(),store);
  assert_eq!(c.query_row("SELECT body FROM snapshots WHERE scope='guest'",[],|r|r.get::<_,String>(0)).unwrap(),body);
  assert_eq!(c.query_row("SELECT count(*) FROM workspace_store WHERE scope!='guest'",[],|r|r.get::<_,i32>(0)).unwrap(),0);
 }

 #[test]fn index_updates_and_backups(){
 let mut c=Connection::open_in_memory().unwrap();schema(&c).unwrap();
 let a=r#"{"version":2,"tasks":[{"id":"one","title":"alpha","notes":""},{"id":"two","title":"bravo","notes":""}]}"#;
 let b=r#"{"version":2,"tasks":[{"id":"one","title":"gamma","notes":""},{"id":"two","title":"bravo","notes":""}]}"#;
 save(&mut c,"guest",a).unwrap();create_backup(&mut c,"guest").unwrap();save(&mut c,"guest",b).unwrap();
 let n=|s:&str|c.query_row("SELECT count(*) FROM task_search WHERE task_search MATCH ?1",[s],|r|r.get::<_,i32>(0)).unwrap();
 assert_eq!(n("alpha"),0);assert_eq!(n("bravo"),1);assert_eq!(n("gamma"),1);
 for _ in 0..30{create_backup(&mut c,"guest").unwrap();}
 assert_eq!(c.query_row("SELECT count(*) FROM backups WHERE scope='guest'",[],|r|r.get::<_,i32>(0)).unwrap(),24);
 }

}
