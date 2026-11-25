use std::{sync::{Mutex,atomic::{AtomicBool,Ordering}}, time::Duration};
use chrono::Local;
use rusqlite::{params, Connection, OptionalExtension};
use tauri::{Emitter, Manager, WindowEvent, menu::{Menu, MenuItem}, tray::TrayIconBuilder};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_notification::NotificationExt;

struct Database(Mutex<Connection>);
struct ActiveScope(Mutex<Option<String>>);
struct QuickCapture(AtomicBool);
struct ShortcutStatus(Mutex<String>);
#[tauri::command]
fn native_take_quick_capture(pending:tauri::State<QuickCapture>)->bool{pending.0.swap(false,Ordering::AcqRel)}
#[tauri::command]
fn native_shortcut_status(status:tauri::State<ShortcutStatus>)->String{status.0.lock().map(|v|v.clone()).unwrap_or_else(|_|"unknown".into())}
fn request_quick_capture(app:&tauri::AppHandle){
 app.state::<QuickCapture>().0.store(true,Ordering::Release);show(app);let _=app.emit("todo-quick-add",());
}

fn valid_scope(s:&str)->bool { s=="guest" || (s.len()==36 && s.chars().all(|c|c.is_ascii_hexdigit()||c=='-')) }
fn schema(c:&Connection)->rusqlite::Result<()> {
 c.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS snapshots(scope TEXT PRIMARY KEY, body TEXT NOT NULL, updated_at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS backups(scope TEXT NOT NULL, body TEXT NOT NULL, saved_at INTEGER NOT NULL, PRIMARY KEY(scope,saved_at)); CREATE TABLE IF NOT EXISTS delivered(scope TEXT NOT NULL, reminder TEXT NOT NULL, PRIMARY KEY(scope,reminder)); CREATE TABLE IF NOT EXISTS reminder_retry(scope TEXT NOT NULL, reminder TEXT NOT NULL, attempts INTEGER NOT NULL, next_at INTEGER NOT NULL, PRIMARY KEY(scope,reminder)); CREATE TABLE IF NOT EXISTS workspace_store(scope TEXT PRIMARY KEY, body TEXT NOT NULL); CREATE VIRTUAL TABLE IF NOT EXISTS task_search USING fts5(scope UNINDEXED, task_id UNINDEXED, title, notes, tokenize='trigram');")
}
fn save(c:&mut Connection,scope:&str,body:&str)->Result<(),String>{save_with_store(c,scope,body,None)}
fn save_with_store(c:&mut Connection,scope:&str,body:&str,store:Option<&str>)->Result<(),String>{
 if !valid_scope(scope)||body.len()>16_000_000{return Err("无效工作空间或数据过大".into())}
 let state:serde_json::Value=serde_json::from_str(body).map_err(|e|e.to_string())?;
 if state["version"]!=2||!state["tasks"].is_array(){return Err("不支持的工作空间格式".into())}
 let now=Local::now().timestamp();let tx=c.transaction().map_err(|e|e.to_string())?;
 let prior:Option<String>=tx.query_row("SELECT body FROM snapshots WHERE scope=?1",[scope],|r|r.get(0)).optional().map_err(|e|e.to_string())?;
 if prior.as_deref()!=Some(body){
 tx.execute("INSERT OR IGNORE INTO backups SELECT scope,body,?2 FROM snapshots WHERE scope=?1 AND NOT EXISTS(SELECT 1 FROM backups WHERE scope=?1 AND saved_at>?2-3600)",params![scope,now]).map_err(|e|e.to_string())?;
 tx.execute("DELETE FROM backups WHERE scope=?1 AND saved_at NOT IN (SELECT saved_at FROM backups WHERE scope=?1 ORDER BY saved_at DESC LIMIT 24)",[scope]).map_err(|e|e.to_string())?;
 tx.execute("INSERT INTO snapshots VALUES(?1,?2,?3) ON CONFLICT(scope) DO UPDATE SET body=excluded.body,updated_at=excluded.updated_at",params![scope,body,now]).map_err(|e|e.to_string())?;
 let prior_state=prior.as_ref().and_then(|x|serde_json::from_str::<serde_json::Value>(x).ok());
 update_index(&tx,scope,prior_state.as_ref(),&state).map_err(|e|e.to_string())?;
 }
 if let Some(store)=store{tx.execute("INSERT INTO workspace_store VALUES(?1,?2) ON CONFLICT(scope) DO UPDATE SET body=excluded.body",params![scope,store]).map_err(|e|e.to_string())?;}
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
fn create_backup(c:&mut Connection,scope:&str)->Result<(),String>{
 if !valid_scope(scope){return Err("invalid scope".into())}
 let now=Local::now().timestamp();
 let tx=c.transaction().map_err(|e|e.to_string())?;
 let count=tx.execute("INSERT INTO backups(scope,body,saved_at) SELECT scope,body,MAX(?2,COALESCE((SELECT MAX(saved_at)+1 FROM backups WHERE scope=?1),?2)) FROM snapshots WHERE scope=?1",params![scope,now]).map_err(|e|e.to_string())?;
 if count!=1{return Err("没有可备份的工作空间".into())}
 tx.execute("DELETE FROM backups WHERE scope=?1 AND saved_at NOT IN (SELECT saved_at FROM backups WHERE scope=?1 ORDER BY saved_at DESC LIMIT 24)",[scope]).map_err(|e|e.to_string())?;
 tx.commit().map_err(|e|e.to_string())
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
fn persist_store(c:&mut Connection,scope:&str,store:&str)->Result<(),String>{
 if !valid_scope(scope)||store.len()>64_000_000{return Err("工作空间存储过大或标识无效".into())}
 let value:serde_json::Value=serde_json::from_str(store).map_err(|e|e.to_string())?;
 let map=value.as_object().ok_or("无效工作空间存储")?;
 let keys=["todo-workbench-v1","todo-workbench-backup","todo-workbench-backup-at","todo-workbench-backup-corrupt","todo-cloud-meta","todo-cloud-base","todo-conflict-backup","todo-field-merge-backup","todo-native-migration-backup"];
 if map.iter().any(|(k,v)|!keys.contains(&k.as_str())||!v.is_string()){return Err("工作空间存储键无效".into())}
 let body=map.get("todo-workbench-v1").and_then(|x|x.as_str()).ok_or("缺少工作空间数据")?;
 save_with_store(c,scope,body,Some(store))
}
#[tauri::command]
fn native_write_store(scope:String,store:String,db:tauri::State<Database>)->Result<(),String>{
 let mut conn=db.0.lock().map_err(|e|e.to_string())?;
 persist_store(&mut conn,&scope,&store)
}
#[tauri::command]
fn native_activate(scope:Option<String>,active:tauri::State<ActiveScope>)->Result<(),String>{
 if scope.as_deref().is_some_and(|s|!valid_scope(s)){return Err("invalid scope".into())}
 *active.0.lock().map_err(|e|e.to_string())?=scope;Ok(())
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
fn native_exit(app:tauri::AppHandle){if let Some(w)=app.get_webview_window("main"){save_window(&w);}app.exit(0)}
#[tauri::command]
fn native_test_notification(app:tauri::AppHandle)->Result<(),String>{
 app.notification().builder().title("TODO").body("这是一条测试提醒。请在系统通知中心确认。").show().map_err(|e|e.to_string())
}
#[derive(serde::Serialize,serde::Deserialize)]
struct WindowGeometry { width:u32,height:u32,maximized:bool }
fn geometry_path(app:&tauri::AppHandle)->Option<std::path::PathBuf>{app.path().app_data_dir().ok().map(|p|p.join("window-state.json"))}
fn save_window(w:&tauri::WebviewWindow){
 let Some(path)=geometry_path(w.app_handle())else{return};
 let Ok(maximized)=w.is_maximized()else{return};
 if maximized{
  if let Ok(raw)=std::fs::read(&path){if let Ok(mut g)=serde_json::from_slice::<WindowGeometry>(&raw){g.maximized=true;let _=write_geometry(&path,&g);return}}
 }
 let (Ok(size),Ok(scale))=(w.inner_size(),w.scale_factor())else{return};let logical=size.to_logical::<f64>(scale);
 let g=WindowGeometry{width:logical.width.round().clamp(760.,3840.) as u32,height:logical.height.round().clamp(520.,2160.) as u32,maximized};
 let _=write_geometry(&path,&g);
}
fn write_geometry(path:&std::path::Path,g:&WindowGeometry)->Result<(),String>{
 let tmp=path.with_extension("tmp");std::fs::write(&tmp,serde_json::to_vec(g).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
 std::fs::rename(tmp,path).map_err(|e|e.to_string())
}
fn restore_window(w:&tauri::WebviewWindow){
 let Some(path)=geometry_path(w.app_handle())else{return};let Ok(raw)=std::fs::read(path)else{return};
 let Ok(g)=serde_json::from_slice::<WindowGeometry>(&raw)else{return};
 let (mut width,mut height)=(g.width.clamp(760,3840),g.height.clamp(520,2160));
 if let Ok(Some(m))=w.current_monitor(){let scale=m.scale_factor();let limit=m.size().to_logical::<f64>(scale);width=width.min((limit.width-40.).max(760.) as u32);height=height.min((limit.height-100.).max(520.) as u32);}
 let _=w.set_size(tauri::LogicalSize::new(width,height));let _=w.center();if g.maximized{let _=w.maximize();}
}
fn show(app:&tauri::AppHandle){if let Some(w)=app.get_webview_window("main"){let _=w.show();let _=w.unminimize();let _=w.set_focus();}}
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
 tauri::Builder::default()
 .plugin(tauri_plugin_single_instance::init(|app,_,_|show(app)))
 .plugin(tauri_plugin_notification::init())
 .plugin(tauri_plugin_global_shortcut::Builder::new().with_handler(|app,_,event|{if event.state()==ShortcutState::Pressed{request_quick_capture(app);}}).build())
 .invoke_handler(tauri::generate_handler![native_load,native_save,native_load_store,native_write_store,native_activate,native_search,native_list_backups,native_read_backup,native_create_backup,native_notify,native_exit,native_test_notification,native_take_quick_capture,native_shortcut_status])
 .setup(|app|{
  let path=app.path().app_data_dir()?;std::fs::create_dir_all(&path)?;let c=Connection::open(path.join("todo.sqlite3"))?;schema(&c)?;
  app.manage(Database(Mutex::new(c)));app.manage(ActiveScope(Mutex::new(None)));app.manage(QuickCapture(AtomicBool::new(false)));app.manage(ShortcutStatus(Mutex::new("not-registered".into())));
  let open=MenuItem::with_id(app,"open","打开 TODO",true,None::<&str>)?;let quit=MenuItem::with_id(app,"quit","退出 TODO",true,None::<&str>)?;
  let quick=MenuItem::with_id(app,"quick","快速新建任务",true,None::<&str>)?;let hide=MenuItem::with_id(app,"hide","隐藏主窗口",true,None::<&str>)?;let menu=Menu::with_items(app,&[&open,&quick,&hide,&quit])?;
  let mut tray=TrayIconBuilder::new().menu(&menu).tooltip("TODO").on_menu_event(|app,event|match event.id.as_ref(){"open"=>show(app),"quick"=>request_quick_capture(app),"hide"=>{if let Some(w)=app.get_webview_window("main"){save_window(&w);let _=w.hide();}},"quit"=>{let active=app.state::<ActiveScope>();if active.0.lock().ok().and_then(|s|s.clone()).is_some(){let _=app.emit("todo-quit-request",());}else{app.exit(0)}},_=>{}});
  if let Some(icon)=app.default_window_icon(){tray=tray.icon(icon.clone())}tray.build(app)?;
  if app.config().identifier == "com.weepwood.todo" {
   let status=match app.global_shortcut().register("CommandOrControl+Shift+A"){Ok(())=>"registered",Err(e)=>{eprintln!("global shortcut unavailable: {e}");"unavailable"}};
   if let Ok(mut value)=app.state::<ShortcutStatus>().0.lock(){*value=status.into()}
  }
  if let Some(w)=app.get_webview_window("main"){restore_window(&w);}schedule(app.handle().clone());Ok(())
 })
 .on_window_event(|window,event|{if let WindowEvent::CloseRequested{api,..}=event{api.prevent_close();if let Some(w)=window.app_handle().get_webview_window("main"){save_window(&w);}let _=window.hide();}})
 .run(tauri::generate_context!()).expect("TODO native application failed")
}
#[cfg(test)]mod tests{
 use super::*;
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
