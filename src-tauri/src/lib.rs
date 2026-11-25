use std::{sync::Mutex, time::Duration};
use chrono::Local;
use rusqlite::{params, Connection, OptionalExtension};
use tauri::{Emitter, Manager, WindowEvent, menu::{Menu, MenuItem}, tray::TrayIconBuilder};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_notification::NotificationExt;

struct Database(Mutex<Connection>);
struct ActiveScope(Mutex<Option<String>>);
fn valid_scope(s:&str)->bool { s=="guest" || (s.len()==36 && s.chars().all(|c|c.is_ascii_hexdigit()||c=='-')) }
fn schema(c:&Connection)->rusqlite::Result<()> {
 c.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS snapshots(scope TEXT PRIMARY KEY, body TEXT NOT NULL, updated_at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS backups(scope TEXT NOT NULL, body TEXT NOT NULL, saved_at INTEGER NOT NULL, PRIMARY KEY(scope,saved_at)); CREATE TABLE IF NOT EXISTS delivered(scope TEXT NOT NULL, reminder TEXT NOT NULL, PRIMARY KEY(scope,reminder)); CREATE TABLE IF NOT EXISTS workspace_store(scope TEXT PRIMARY KEY, body TEXT NOT NULL); CREATE VIRTUAL TABLE IF NOT EXISTS task_search USING fts5(scope UNINDEXED, task_id UNINDEXED, title, notes, tokenize='trigram');")
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
 tx.execute("DELETE FROM task_search WHERE scope=?1",[scope]).map_err(|e|e.to_string())?;
 {let mut stmt=tx.prepare("INSERT INTO task_search VALUES(?1,?2,?3,?4)").map_err(|e|e.to_string())?;for t in state["tasks"].as_array().unwrap(){if t["deletedAt"].is_null(){stmt.execute(params![scope,t["id"].as_str().unwrap_or(""),t["title"].as_str().unwrap_or(""),t["notes"].as_str().unwrap_or("")]).map_err(|e|e.to_string())?;}}}
 }
 if let Some(store)=store{tx.execute("INSERT INTO workspace_store VALUES(?1,?2) ON CONFLICT(scope) DO UPDATE SET body=excluded.body",params![scope,store]).map_err(|e|e.to_string())?;}
 tx.commit().map_err(|e|e.to_string())
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
 let keys=["todo-workbench-v1","todo-workbench-backup","todo-workbench-backup-at","todo-workbench-backup-corrupt","todo-cloud-meta","todo-cloud-base","todo-conflict-backup","todo-native-migration-backup"];
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
fn native_notify(scope:String,task_id:String,at:String,title:String,db:tauri::State<Database>,app:tauri::AppHandle)->Result<(),String>{
 if !valid_scope(&scope){return Err("invalid scope".into())}
 let c=db.0.lock().map_err(|e|e.to_string())?;
 let key=format!("{}:{}",task_id,at);
 if c.execute("INSERT OR IGNORE INTO delivered VALUES(?1,?2)",params![scope,key]).map_err(|e|e.to_string())?==1{
  app.notification().builder().title("TODO").body(&title).show().map_err(|e|e.to_string())?;
 }
 Ok(())
}
#[tauri::command]
fn native_exit(app:tauri::AppHandle){app.exit(0)}
fn show(app:&tauri::AppHandle){if let Some(w)=app.get_webview_window("main"){let _=w.show();let _=w.set_focus();}}
fn schedule(app:tauri::AppHandle){
 std::thread::spawn(move||loop{
  std::thread::sleep(Duration::from_secs(5));
  let active=app.state::<ActiveScope>();let scope=active.0.lock().ok().and_then(|s|s.clone());let Some(scope)=scope else{continue};
  let db=app.state::<Database>();let Ok(c)=db.0.lock() else{continue};
  let body:Option<String>=c.query_row("SELECT body FROM snapshots WHERE scope=?1",[&scope],|r|r.get(0)).optional().ok().flatten();
  let Some(body)=body else{continue};let Ok(state)=serde_json::from_str::<serde_json::Value>(&body) else{continue};let Some(tasks)=state["tasks"].as_array() else{continue};
  let now=Local::now().format("%Y-%m-%dT%H:%M").to_string();
  for t in tasks {if t["status"]!="pending"||!t["deletedAt"].is_null(){continue}
   let mut dates=vec![];if let Some(at)=t["reminderAt"].as_str(){if t["remindedAt"].is_null(){dates.push(at)}}
   if let Some(extra)=t["extraReminders"].as_array(){for r in extra{if r["sentAt"].is_null(){if let Some(at)=r["at"].as_str(){dates.push(at)}}}}
   for at in dates {if at.is_empty()||at>now.as_str(){continue}let key=format!("{}:{}",t["id"].as_str().unwrap_or(""),at);
    if c.execute("INSERT OR IGNORE INTO delivered VALUES(?1,?2)",params![scope,key]).unwrap_or(0)==1{let _=app.notification().builder().title("TODO").body(t["title"].as_str().unwrap_or("任务提醒")).show();}
   }
  }
 });
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run(){
 tauri::Builder::default()
 .plugin(tauri_plugin_single_instance::init(|app,_,_|show(app)))
 .plugin(tauri_plugin_notification::init())
 .plugin(tauri_plugin_global_shortcut::Builder::new().with_handler(|app,_,event|{if event.state()==ShortcutState::Pressed{show(app);let _=app.emit("todo-quick-add",());}}).build())
 .invoke_handler(tauri::generate_handler![native_load,native_save,native_load_store,native_write_store,native_activate,native_search,native_notify,native_exit])
 .setup(|app|{
  let path=app.path().app_data_dir()?;std::fs::create_dir_all(&path)?;let c=Connection::open(path.join("todo.sqlite3"))?;schema(&c)?;
  app.manage(Database(Mutex::new(c)));app.manage(ActiveScope(Mutex::new(None)));
  let open=MenuItem::with_id(app,"open","打开 TODO",true,None::<&str>)?;let quit=MenuItem::with_id(app,"quit","退出 TODO",true,None::<&str>)?;
  let menu=Menu::with_items(app,&[&open,&quit])?;
  let mut tray=TrayIconBuilder::new().menu(&menu).tooltip("TODO").on_menu_event(|app,event|match event.id.as_ref(){"open"=>show(app),"quit"=>{let active=app.state::<ActiveScope>();if active.0.lock().ok().and_then(|s|s.clone()).is_some(){let _=app.emit("todo-quit-request",());}else{app.exit(0)}},_=>{}});
  if let Some(icon)=app.default_window_icon(){tray=tray.icon(icon.clone())}tray.build(app)?;
  if let Err(e)=app.global_shortcut().register("CommandOrControl+Shift+A"){eprintln!("global shortcut unavailable: {e}")}
  schedule(app.handle().clone());Ok(())
 })
 .on_window_event(|window,event|{if let WindowEvent::CloseRequested{api,..}=event{api.prevent_close();let _=window.hide();}})
 .run(tauri::generate_context!()).expect("TODO native application failed")
}
#[cfg(test)]mod tests{
 use super::*;
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

}
