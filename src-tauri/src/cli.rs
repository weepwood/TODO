//! Local CLI uses only the existing durable intake queue. The application owns
//! workspace writes. Binding is explicit and never follows a login change.
use chrono::{Local,NaiveDate,NaiveTime,Days};
use rusqlite::{Connection,OpenFlags,OptionalExtension,params,TransactionBehavior};
use serde_json::{Value,json};
use sha2::{Sha256,Digest};
use std::{path::PathBuf,time::{Duration,Instant},io::{Read,self},collections::BTreeMap};
use uuid::Uuid;
type Res<T>=Result<T,String>;
const HELP:&str="TODO local CLI\n  todo doctor\n  todo lists\n  todo add TITLE [--date YYYY-MM-DD|today|tomorrow|day-after-tomorrow] [--time HH:mm] [--list NAME | --list-id ID] [--priority none|low|medium|high] [--duration MIN] [--notes TEXT] [--deadline YYYY-MM-DD] [--reminder-at YYYY-MM-DDTHH:mm] [--request-id UUID] [--wait SECONDS]\n  todo batch --file PATH|- [--request-id UUID] [--wait SECONDS]\n  todo status UUID\n  todo run --file PATH|- [--request-id UUID] [--wait SECONDS]\n  todo schema\n  v4 history via todo run: history-list, history-show, history-preview, history-apply. Native user confirmation required for advanced writes.\n  v3 management via todo run: context, plan-preview, plan-explain, reflow-preview, changes-preview, split-preview, preview-apply, changes-undo, audit, review. See todo schema.\n  todo today|upcoming|overdue|catalog [--request-id UUID] [--wait SECONDS]\n  todo search QUERY [--request-id UUID] [--wait SECONDS]\n  todo show TASK_ID [--request-id UUID] [--wait SECONDS]\n  Rich add flags: --end HH:mm [--end-date YYYY-MM-DD], --repeat TYPE, --interval N, --weekdays 1,3,5, --repeat-until DATE, --repeat-count N, --reminder-offsets 15,5, --tags ID,ID, --section-id ID, --plan-minutes N\n  todo bind --scope guest|UUID (explicit local workspace)\n  todo unbind\nOptions before command: --data-dir PATH (isolated installation only; default macOS TODO app data).\nBind the desired workspace in TODO Settings > Account & Sync before use.\nreceived is queued, saved is durable local commit; cloud sync is not asserted.\nA single request can be pending per bound workspace; retry with the same UUID and content.\n";
pub(super) fn bound_scope(c:&Connection)->Res<Option<String>>{c.query_row("SELECT scope FROM cli_binding WHERE slot=1",[],|r|r.get(0)).optional().map_err(|e|e.to_string())}
pub(super) fn advanced_scope(c:&Connection,scope:&str)->Res<bool>{
 if !operation_ready(c)?{return Ok(false)}
 c.query_row("SELECT EXISTS(SELECT 1 FROM cli_operation_access WHERE slot=1 AND scope=?1)",[scope],|r|r.get(0)).map_err(|e|e.to_string())
}
fn guard_access_change(c:&Connection,scope:&str)->Res<()>{
 if !operation_ready(c)?{return Ok(())}
 let pending:bool=c.query_row("SELECT EXISTS(SELECT 1 FROM direct_capture_requests d JOIN cli_operation_meta m ON d.scope=m.scope AND d.id=m.id WHERE d.scope='cli-op:'||?1 AND d.status='pending' AND m.kind<>'create')",[scope],|r|r.get(0)).map_err(|e|e.to_string())?;
 if pending{return Err("advanced operation pending; wait for its terminal receipt before changing authorization".into())}Ok(())
}
pub(super) fn set_advanced(c:&Connection,scope:&str,enabled:bool)->Res<bool>{
 if !operation_ready(c)?{return Err("updated app required".into())}
 let tx=c.unchecked_transaction().map_err(|e|e.to_string())?;
 if bound_scope(&tx)?.as_deref()!=Some(scope){return Err("bind workspace first".into())}
 if enabled{tx.execute("INSERT INTO cli_operation_access(slot,scope) VALUES(1,?1) ON CONFLICT(slot) DO UPDATE SET scope=excluded.scope",[scope]).map_err(|e|e.to_string())?;}
 else{guard_access_change(&tx,scope)?;tx.execute("DELETE FROM cli_operation_access WHERE slot=1 AND scope=?1",[scope]).map_err(|e|e.to_string())?;}
 tx.commit().map_err(|e|e.to_string())?;Ok(enabled)
}
pub(super) fn unbind(c:&Connection,scope:Option<&str>)->Res<()>{
 let tx=c.unchecked_transaction().map_err(|e|e.to_string())?;
 if let Some(old)=bound_scope(&tx)?{
  if scope.is_none()||scope==Some(&old){
   guard_access_change(&tx,&old)?;
   if operation_ready(&tx)?{tx.execute("DELETE FROM cli_operation_access WHERE slot=1",[]).map_err(|e|e.to_string())?;}
   tx.execute("DELETE FROM cli_binding WHERE slot=1",[]).map_err(|e|e.to_string())?;
  }
 }
 tx.commit().map_err(|e|e.to_string())
}
pub(super) fn bind(c:&Connection,scope:&str)->Res<()>{
 if !super::valid_scope(scope)||scope!="guest"&&Uuid::parse_str(scope).is_err(){return Err("invalid scope".into())}
 let exists:bool=c.query_row("SELECT EXISTS(SELECT 1 FROM snapshots WHERE scope=?1)",[scope],|r|r.get(0)).map_err(|e|e.to_string())?;
 if !exists{return Err("workspace not initialized; open TODO and wait for local save".into())}
 let tx=c.unchecked_transaction().map_err(|e|e.to_string())?;
 if let Some(old)=bound_scope(&tx)?{if old!=scope{guard_access_change(&tx,&old)?;if operation_ready(&tx)?{tx.execute("DELETE FROM cli_operation_access WHERE slot=1",[]).map_err(|e|e.to_string())?;}}}
 tx.execute("INSERT INTO cli_binding(slot,scope) VALUES(1,?1) ON CONFLICT(slot) DO UPDATE SET scope=excluded.scope",[scope]).map_err(|e|e.to_string())?;
 tx.commit().map_err(|e|e.to_string())
}
fn date(v:&str)->bool{v.len()==10&&v.bytes().enumerate().all(|(i,b)|if i==4||i==7{b==b'-'}else{b.is_ascii_digit()})&&NaiveDate::parse_from_str(v,"%Y-%m-%d").is_ok()&&v>="1900-01-01"&&v<="9998-12-31"}
fn time(v:&str)->bool{v.len()==5&&v.bytes().enumerate().all(|(i,b)|if i==2{b==b':'}else{b.is_ascii_digit()})&&NaiveTime::parse_from_str(v,"%H:%M").is_ok()}
fn normalized(rows:Value)->Res<Value>{
 let rows=rows.as_array().filter(|r|!r.is_empty()&&r.len()<=50).ok_or("expected 1–50 task objects")?;
 let mut out=vec![];
 for (i,r) in rows.iter().enumerate(){
  let bad=||format!("invalid task {}",i+1);
  let o=r.as_object().ok_or_else(bad)?;
  let title=o.get("title").and_then(Value::as_str).map(str::trim).filter(|x|!x.is_empty()&&x.encode_utf16().count()<=500).ok_or_else(bad)?;
  let mut n=o.clone();n.insert("title".into(),json!(title));
  for (k,v) in o{
   let valid=match k.as_str(){
    "title"=>true,
    "notes"=>v.as_str().is_some_and(|x|x.encode_utf16().count()<=10000),
    "listId"=>v.as_str().is_some_and(|x|!x.trim().is_empty()&&x.encode_utf16().count()<=200),
    "date"=>v.as_str().is_some_and(|x|x.is_empty()||date(x)),
    "deadline"=>v.as_str().is_some_and(|x|x.is_empty()||date(x)||x.is_ascii()&&x.len()==16&&x.as_bytes()[10]==b'T'&&date(&x[..10])&&time(&x[11..])),
    "time"=>v.as_str().is_some_and(|x|x.is_empty()||time(x)&&o.get("date").and_then(Value::as_str).is_some_and(date)),
    "reminderAt"=>v.as_str().is_some_and(|x|x.is_empty()||x.is_ascii()&&x.len()==16&&x.as_bytes()[10]==b'T'&&date(&x[..10])&&time(&x[11..])),
    "duration"=>v.as_i64().is_some_and(|x|(1..=1440).contains(&x)),
    "priority"=>v.as_i64().is_some_and(|x|(0..=3).contains(&x)),
    _=>false
   };
   if !valid{return Err(bad())}
  }
  out.push(Value::Object(n));
 }
 let result=Value::Array(out);
 if result.to_string().len()>262144{return Err("payload exceeds 256 KiB".into())}
 Ok(result)
}
fn lists(c:&Connection,scope:&str)->Res<Vec<Value>>{
 let raw:String=c.query_row("SELECT body FROM snapshots WHERE scope=?1",[scope],|r|r.get(0)).map_err(|_|"bound workspace missing")?;
 let state:Value=serde_json::from_str(&raw).map_err(|_|"invalid workspace snapshot")?;
 let list=state["lists"].as_array().ok_or("workspace has no lists")?;
 Ok(list.iter().filter_map(|l|Some(json!({"id":l["id"].as_str()?,"name":l["name"].as_str()?}))).collect())
}
fn operation_ready(c:&Connection)->Res<bool>{c.query_row("SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='cli_operation_meta')",[],|r|r.get(0)).map_err(|e|e.to_string())}
fn op_receipt(c:&Connection,scope:&str,id:&str)->Res<Option<Value>>{
 if !operation_ready(c)?{return Ok(None)}
 let row:Option<(String,Option<String>,String,i64)>=c.query_row("SELECT d.status,m.result,m.kind,d.created_at FROM direct_capture_requests d JOIN cli_operation_meta m ON d.scope=m.scope AND d.id=m.id WHERE d.scope=?1 AND d.id=?2",params![format!("cli-op:{scope}"),id],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))).optional().map_err(|e|e.to_string())?;
 row.map(|(status,result,kind,created_at)|{
  let status=if status=="pending"{"received"}else{&status};
  if kind!="create"&&!advanced_scope(c,scope)?{return Ok(json!({"request_id":id,"status":status,"result":null,"result_access":"not_authorized","sync_status":"not_checked"}))}
  if status!="received"&&(MANAGEMENT.contains(&kind.as_str())||HISTORY.contains(&kind.as_str()))&&(result.is_none()||Local::now().timestamp()-created_at>7*86400){return Ok(json!({"request_id":id,"status":status,"result":null,"result_access":"expired","sync_status":"not_checked"}))}
  let result=result.map(|v|serde_json::from_str::<Value>(&v).map_err(|_|"invalid operation receipt")).transpose()?;
  Ok(json!({"request_id":id,"status":status,"result":result,"sync_status":"not_checked"}))
 }).transpose()
}
fn receipt(c:&Connection,scope:&str,id:&str)->Res<Value>{
 if let Some(r)=op_receipt(c,scope,id)?{return Ok(r)}

 let row:Option<(String,usize)>=c.query_row("SELECT d.status,m.task_count FROM direct_capture_requests d JOIN cli_capture_meta m ON d.scope=m.scope AND d.id=m.id WHERE d.scope=?1 AND d.id=?2",params![format!("cli:{scope}"),id],|r|Ok((r.get(0)?,r.get(1)?))).optional().map_err(|e|e.to_string())?;
 let (status,count)=row.ok_or("request not found in bound workspace")?;
 let status=if status=="pending"{"received"}else{&status};
 let ids:Vec<_>=if status=="saved"{(1..=count).map(|i|format!("{id}:{i}")).collect()}else{vec![]};
 Ok(json!({"request_id":id,"status":status,"task_count":count,"task_ids":ids,"sync_status":"not_checked"}))
}
fn enqueue(c:&mut Connection,scope:&str,id:&str,rows:Value)->Res<Value>{
 let rows=normalized(rows)?;let raw=rows.to_string();let digest=format!("{:x}",Sha256::digest(raw.as_bytes()));let count=rows.as_array().unwrap().len();
 let queue_scope=format!("cli:{scope}");
 let tx=c.transaction_with_behavior(TransactionBehavior::Immediate).map_err(|e|e.to_string())?;
 if bound_scope(&tx)?.as_deref()!=Some(scope){return Err("binding changed; retry after checking scope".into())}
 let existing:Option<String>=tx.query_row("SELECT digest FROM cli_capture_meta WHERE scope=?1 AND id=?2",params![&queue_scope,id],|r|r.get(0)).optional().map_err(|e|e.to_string())?;
 if let Some(d)=existing{
  if d!=digest{return Err("idempotency conflict: same UUID, different content".into())}
  let r=receipt(&tx,scope,id)?;tx.commit().map_err(|e|e.to_string())?;return Ok(r)
 }
 if super::direct_status(&tx,scope,id).map_err(|e|e.to_string())?.is_some()||op_receipt(&tx,scope,id)?.is_some(){return Err("request ID conflicts with other capture".into())}
 let avail=lists(&tx,scope)?;
 for r in rows.as_array().unwrap(){let target=r["listId"].as_str().unwrap_or("inbox");if !avail.iter().any(|l|l["id"]==target){return Err("target list not found".into())}}
 for i in 1..=count{if super::direct_task_exists(&tx,scope,&format!("{id}:{i}")).map_err(|e|e.to_string())?{return Err("task ID already exists".into())}}
 let pending:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM direct_capture_requests WHERE (scope=?1 OR scope='cli:'||?1 OR scope='cli-op:'||?1) AND status='pending')",[scope],|r|r.get(0)).map_err(|e|e.to_string())?;
 if pending{return Err("another capture is pending; retry this request with same UUID later".into())}
 tx.execute("INSERT INTO direct_capture_requests(scope,id,generation,text,status,created_at) VALUES(?1,?2,0,?3,'pending',?4)",params![&queue_scope,id,raw,Local::now().timestamp()]).map_err(|e|e.to_string())?;
 tx.execute("INSERT INTO cli_capture_meta(scope,id,digest,task_count) VALUES(?1,?2,?3,?4)",params![&queue_scope,id,digest,count]).map_err(|e|e.to_string())?;
 let r=receipt(&tx,scope,id)?;tx.commit().map_err(|e|e.to_string())?;Ok(r)
}
pub(super) const HISTORY:&[&str]=&["history-list","history-show","history-preview","history-apply"];
fn history_ready(c:&Connection)->Res<bool>{c.query_row("SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='operation_history_head')",[],|r|r.get(0)).map_err(|e|e.to_string())}
pub(super) const MANAGEMENT:&[&str]=&["context","plan-preview","plan-explain","reflow-preview","changes-preview","split-preview","preview-apply","changes-undo","audit","review"];
fn management_ready(c:&Connection)->Res<bool>{c.query_row("SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='cli_management_v3')",[],|r|r.get(0)).map_err(|e|e.to_string())}
const OPERATIONS:&[&str]=&["create","query","show","catalog","calendar","stats","update","complete","reopen","restore","move","postpone","series","undo-completion","entity-create","entity-rename","habit-create","habit-check","focus-start","focus-change"];
fn enqueue_operation(c:&mut Connection,scope:&str,id:&str,payload:Value)->Res<Value>{
 if !operation_ready(c)?{return Err("operation API requires updated native application".into())}
 if !payload.is_object()||!payload["op"].as_str().is_some_and(|x|OPERATIONS.contains(&x)||MANAGEMENT.contains(&x)||HISTORY.contains(&x)){return Err("unsupported operation; use todo schema".into())}
 let kind=payload["op"].as_str().unwrap();
 if HISTORY.contains(&kind)&&!history_ready(c)?{return Err("history API requires updated native application".into())}
 if let Some(group)=payload.get("operationGroup"){if !history_ready(c)?||!group.as_str().is_some_and(|x|uuid::Uuid::parse_str(x).is_ok()){return Err("invalid operation group or outdated application".into())}}
 if MANAGEMENT.contains(&kind)&&!management_ready(c)?{return Err("management API requires updated native application".into())}
 let raw=payload.to_string();if raw.len()>262144{return Err("payload exceeds 256 KiB".into())}
 let digest=format!("{:x}",Sha256::digest(raw.as_bytes()));let queue_scope=format!("cli-op:{scope}");
 let tx=c.transaction_with_behavior(TransactionBehavior::Immediate).map_err(|e|e.to_string())?;
 if bound_scope(&tx)?.as_deref()!=Some(scope){return Err("binding changed".into())}
 if kind!="create"&&!advanced_scope(&tx,scope)?{return Err("advanced CLI access not enabled; authorize it in TODO settings".into())}
 // Expire only v3 result bodies; preserve digest and terminal status forever.
 tx.execute("UPDATE cli_operation_meta SET result=NULL WHERE scope=?1 AND result IS NOT NULL AND kind IN ('context','plan-preview','plan-explain','reflow-preview','changes-preview','split-preview','preview-apply','changes-undo','audit','review','history-list','history-show','history-preview','history-apply') AND EXISTS(SELECT 1 FROM direct_capture_requests d WHERE d.scope=cli_operation_meta.scope AND d.id=cli_operation_meta.id AND d.status<>'pending' AND d.created_at<?2)",params![&queue_scope,Local::now().timestamp()-7*86400]).map_err(|e|e.to_string())?;
 let old:Option<String>=tx.query_row("SELECT digest FROM cli_operation_meta WHERE scope=?1 AND id=?2",params![&queue_scope,id],|r|r.get(0)).optional().map_err(|e|e.to_string())?;
 if let Some(old)=old{
  if old!=digest{return Err("idempotency conflict: same UUID, different content".into())}
  let r=op_receipt(&tx,scope,id)?.ok_or("operation receipt missing")?;tx.commit().map_err(|e|e.to_string())?;return Ok(r)
 }
 if super::direct_status(&tx,scope,id).map_err(|e|e.to_string())?.is_some()||super::direct_status(&tx,&format!("cli:{scope}"),id).map_err(|e|e.to_string())?.is_some(){return Err("request ID conflicts with other capture".into())}
 let pending:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM direct_capture_requests WHERE (scope=?1 OR scope='cli:'||?1 OR scope='cli-op:'||?1) AND status='pending')",[scope],|r|r.get(0)).map_err(|e|e.to_string())?;
 if pending{return Err("another capture or operation is pending; retry same UUID later".into())}
 tx.execute("INSERT INTO direct_capture_requests(scope,id,generation,text,status,created_at) VALUES(?1,?2,0,?3,'pending',?4)",params![&queue_scope,id,raw,Local::now().timestamp()]).map_err(|e|e.to_string())?;
 tx.execute("INSERT INTO cli_operation_meta(scope,id,digest,kind,result) VALUES(?1,?2,?3,?4,NULL)",params![&queue_scope,id,digest,kind]).map_err(|e|e.to_string())?;
 let r=op_receipt(&tx,scope,id)?.ok_or("operation receipt missing")?;tx.commit().map_err(|e|e.to_string())?;Ok(r)
}
fn read_payload(file:&str)->Res<Value>{
 let mut raw=Vec::new();if file=="-"{io::stdin().take(262145).read_to_end(&mut raw)}else{std::fs::File::open(file).map_err(|_|"cannot open input file")?.take(262145).read_to_end(&mut raw)}.map_err(|_|"cannot read input")?;
 if raw.len()>262144{return Err("payload exceeds 256 KiB".into())}
 serde_json::from_slice(&raw).map_err(|_|"invalid JSON".into())
}
fn await_receipt(c:&Connection,scope:&str,id:&str,mut r:Value,wait:u64)->Res<Value>{
 let start=Instant::now();
 while r["status"]=="received"&&start.elapsed()<Duration::from_secs(wait){
  std::thread::sleep(Duration::from_millis(200));
  if bound_scope(c)?.as_deref()!=Some(scope){return Ok(r)}
  r=receipt(c,scope,id)?;
 }
 Ok(r)
}
fn parse_opts(args:&[String],allowed:&[&str])->Res<BTreeMap<String,String>>{
 if args.len()%2!=0{return Err("options require values".into())}
 let mut opts=BTreeMap::new();
 for pair in args.chunks_exact(2){
  if !allowed.contains(&pair[0].as_str())||opts.insert(pair[0].clone(),pair[1].clone()).is_some(){return Err("unknown or duplicate option".into())}
 }
 Ok(opts)
}
fn absolute_date(s:&str)->Res<String>{
 let days=match s{"today"=>0,"tomorrow"=>1,"day-after-tomorrow"=>2,_=>{if date(s){return Ok(s.into())}return Err("invalid date".into())}};
 Ok(Local::now().date_naive().checked_add_days(Days::new(days)).ok_or("date out of range")?.format("%Y-%m-%d").to_string())
}
fn add_row(c:&Connection,scope:&str,title:&str,opts:&BTreeMap<String,String>)->Res<Value>{
 let mut r=json!({"title":title});
 for (flag,k) in [("--notes","notes"),("--list-id","listId"),("--time","time"),("--deadline","deadline"),("--reminder-at","reminderAt")]{
  if let Some(v)=opts.get(flag){r[k]=json!(v)}
 }
 if let Some(name)=opts.get("--list"){
  if opts.contains_key("--list-id"){return Err("choose --list or --list-id".into())}
  let found:Vec<_>=lists(c,scope)?.into_iter().filter(|l|l["name"]==name.as_str()).collect();if found.len()!=1{return Err("list name missing or ambiguous; use lists and --list-id".into())}
  r["listId"]=found[0]["id"].clone()
 }
 if let Some(v)=opts.get("--date"){r["date"]=json!(absolute_date(v)?)}
 if let Some(v)=opts.get("--duration"){r["duration"]=json!(v.parse::<i64>().map_err(|_|"invalid duration")?)}
 if let Some(v)=opts.get("--priority"){r["priority"]=json!(match v.as_str(){"none"=>0,"low"=>1,"medium"=>2,"high"=>3,_=>return Err("invalid priority".into())})}
 for (flag,k) in [("--repeat","repeat"),("--repeat-until","repeatUntil"),("--section-id","sectionId")]{if let Some(v)=opts.get(flag){r[k]=json!(v)}}
 for (flag,k) in [("--interval","interval"),("--repeat-count","repeatCount"),("--plan-minutes","planMinutes")]{if let Some(v)=opts.get(flag){r[k]=json!(v.parse::<i64>().map_err(|_|"invalid number")?)}}
 for (flag,k) in [("--weekdays","weekdays"),("--reminder-offsets","reminderOffsets")]{if let Some(v)=opts.get(flag){let numbers=v.split(',').map(|x|x.parse::<i64>().map_err(|_|"invalid number list".to_owned())).collect::<Res<Vec<_>>>()?;r[k]=json!(numbers)}}
 if let Some(v)=opts.get("--tags"){r["tags"]=json!(v.split(',').collect::<Vec<_>>())}
 if let Some(end)=opts.get("--end"){
  if opts.contains_key("--plan-minutes"){return Err("choose --end or --plan-minutes".into())}
  let date=r["date"].as_str().ok_or("--end requires --date")?;let time=r["time"].as_str().ok_or("--end requires --time")?;
  let mut block=json!({"date":date,"start":time,"end":end});
  if let Some(end_date)=opts.get("--end-date"){block["endDate"]=json!(absolute_date(end_date)?)}
  let o=r.as_object_mut().unwrap();o.remove("date");o.remove("time");o.insert("blocks".into(),json!([block]));
 }else if opts.contains_key("--end-date"){return Err("--end-date requires --end".into())}
 Ok(json!([r]))
}
fn request_id(s:Option<&String>)->Res<String>{match s{Some(s)=>Ok(Uuid::parse_str(s).map_err(|_|"invalid request UUID")?.to_string()),None=>Ok(Uuid::new_v4().to_string())}}
fn main_inner(mut args:Vec<String>)->Res<Value>{
 let mut dir=None;
 if args.first().is_some_and(|x|x=="--data-dir"){if args.len()<3{return Err("missing data-dir or command".into())}dir=Some(PathBuf::from(&args[1]));args.drain(..2);}
 let cmd=args.first().map(String::as_str).unwrap_or("help");
 if ["help","--help","-h"].contains(&cmd){return Ok(json!({"help":HELP}))}
 if cmd=="schema"&&args.len()==1{return serde_json::from_str(include_str!("../../docs/ai-integration/cli-schema.json")).map_err(|_|"embedded schema invalid".into())}
 let base=match dir{Some(d)=>d,None=>{if !cfg!(target_os="macos"){return Err("default CLI data location currently supported on macOS only".into())}PathBuf::from(std::env::var_os("HOME").ok_or("HOME not set")?).join("Library/Application Support/com.weepwood.todo")}};
 let path=base.join("todo.sqlite3");
 if !path.is_file(){return Err("TODO local database not found; start the updated app first".into())}
 let writable=matches!(cmd,"bind"|"unbind"|"add"|"batch"|"run"|"today"|"upcoming"|"overdue"|"catalog"|"search"|"show");
 let mut c=Connection::open_with_flags(&path,if writable{OpenFlags::SQLITE_OPEN_READ_WRITE}else{OpenFlags::SQLITE_OPEN_READ_ONLY}).map_err(|_|"cannot open TODO database")?;
 c.busy_timeout(Duration::from_secs(5)).map_err(|e|e.to_string())?;
 c.execute_batch("PRAGMA foreign_keys=ON").map_err(|e|e.to_string())?;
 let ready:bool=c.query_row("SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='cli_capture_meta') AND EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='cli_binding')",[],|r|r.get(0)).map_err(|e|e.to_string())?;
 if !ready{return Err("local CLI requires the updated TODO app; no database changes made".into())}
 if cmd=="doctor"&&args.len()==1{return Ok(json!({"ready":true,"bound":bound_scope(&c)?.is_some(),"scope_kind":bound_scope(&c)?.map(|s|if s=="guest"{"guest"}else{"account"}),"advanced":match bound_scope(&c)?{Some(s)=>advanced_scope(&c,&s)?,None=>false},"operation_api":if history_ready(&c)?{4}else if management_ready(&c)?{3}else if operation_ready(&c)?{2}else{1},"sync_status":"not_checked"}))}
 if cmd=="bind"{
  let opts=parse_opts(&args[1..],&["--scope"])?;let scope=opts.get("--scope").ok_or("explicit scope required")?;
  bind(&c,scope)?;return Ok(json!({"bound":true,"scope_kind":if scope=="guest"{"guest"}else{"account"}}))
 }
 if cmd=="unbind"&&args.len()==1{unbind(&c,None)?;return Ok(json!({"bound":false}))}
 let scope=bound_scope(&c)?.ok_or("no bound workspace; use TODO Settings or explicit bind --scope")?;
 match cmd{
  "lists" if args.len()==1=>Ok(json!({"lists":lists(&c,&scope)?})),
  "status" if args.len()==2=>receipt(&c,&scope,&request_id(args.get(1))?),
  "today"|"upcoming"|"overdue"|"catalog"|"search"|"show"=>{
   let (payload,start)=match cmd{
    "catalog"=>(json!({"op":"catalog"}),1),
    "search"|"show"=>{let v=args.get(1).filter(|v|!v.starts_with("--")).ok_or("query or task ID required")?;
     (if cmd=="search"{json!({"op":"query","q":v})}else{json!({"op":"show","id":v})},2)},
    _=>(json!({"op":"query","view":cmd}),1)
   };
   let opts=parse_opts(&args[start..],&["--request-id","--wait"])?;
   let id=request_id(opts.get("--request-id"))?;
   let wait=opts.get("--wait").map(|v|v.parse::<u64>().ok().filter(|x|*x<=60).ok_or("wait must be 0–60 seconds")).transpose()?.unwrap_or(5);
   let r=enqueue_operation(&mut c,&scope,&id,payload).map_err(|e|format!("{e}; request_id={id}"))?;
   await_receipt(&c,&scope,&id,r,wait)
  },
  "run"=>{
   let opts=parse_opts(&args[1..],&["--file","--request-id","--wait"])?;
   let id=request_id(opts.get("--request-id"))?;
   let wait=opts.get("--wait").map(|v|v.parse::<u64>().ok().filter(|x|*x<=60).ok_or("wait must be 0–60 seconds")).transpose()?.unwrap_or(5);
   let payload=read_payload(opts.get("--file").ok_or("--file required")?)?;
   let r=enqueue_operation(&mut c,&scope,&id,payload).map_err(|e|format!("{e}; request_id={id}"))?;
   await_receipt(&c,&scope,&id,r,wait)
  },
  "add"|"batch"=>{
   let (rows,opts)=if cmd=="add"{
    let title=args.get(1).ok_or("title required")?;if title.starts_with("--"){return Err("title required".into())}
    let opts=parse_opts(&args[2..],&["--date","--time","--list","--list-id","--priority","--duration","--notes","--deadline","--reminder-at","--request-id","--wait","--end","--end-date","--repeat","--interval","--weekdays","--repeat-until","--repeat-count","--reminder-offsets","--tags","--section-id","--plan-minutes"])?;
    (add_row(&c,&scope,title,&opts)?,opts)
   }else{
    let opts=parse_opts(&args[1..],&["--file","--request-id","--wait"])?;let file=opts.get("--file").ok_or("--file required")?;
    let mut raw=Vec::new();if file=="-"{io::stdin().take(262145).read_to_end(&mut raw)}else{std::fs::File::open(file).map_err(|_|"cannot open input file")?.take(262145).read_to_end(&mut raw)}.map_err(|_|"cannot read batch")?;
    if raw.len()>262144{return Err("payload exceeds 256 KiB".into())}
    (serde_json::from_slice(&raw).map_err(|_|"invalid JSON batch")?,opts)
   };
   let id=request_id(opts.get("--request-id"))?;
   let wait=opts.get("--wait").map(|v|v.parse::<u64>().ok().filter(|x|*x<=60).ok_or("wait must be 0–60 seconds")).transpose()?.unwrap_or(5);
   let rich=rows.as_array().is_some_and(|rows|rows.iter().any(|r|r.as_object().is_some_and(|o|o.keys().any(|k|!["title","notes","listId","date","time","deadline","duration","priority","reminderAt"].contains(&k.as_str())))));
   if rich{
    let r=enqueue_operation(&mut c,&scope,&id,json!({"op":"create","tasks":rows})).map_err(|e|format!("{e}; request_id={id}"))?;
    return await_receipt(&c,&scope,&id,r,wait)
   }
   let mut r=enqueue(&mut c,&scope,&id,rows).map_err(|e|format!("{e}; request_id={id}"))?;
   let start=Instant::now();
   while r["status"]=="received"&&start.elapsed()<Duration::from_secs(wait){
    std::thread::sleep(Duration::from_millis(200));
    // Never follow a new binding while waiting for a receipt.
    if bound_scope(&c)?.as_deref()!=Some(&scope){return Ok(r)}
    r=receipt(&c,&scope,&id)?;
   }
   Ok(r)
  },
  _=>Err("unknown command; use todo --help".into())
 }
}
pub fn main_cli()->i32{
 match main_inner(std::env::args().skip(2).collect()){
  Ok(v)=>{if let Some(h)=v["help"].as_str(){print!("{h}")}else{println!("{}",v)}if v["status"]=="cancelled"{3}else{0}},
  Err(e)=>{println!("{}",json!({"status":"error","error":e}));2}
 }
}
#[cfg(test)]
mod tests{
 use super::*;
 #[test]fn durable_batch_ack_and_conflict(){
  let mut c=Connection::open_in_memory().unwrap();super::super::schema(&c).unwrap();
  let state=json!({"version":2,"lists":[{"id":"inbox","name":"收集箱"}],"tasks":[]});
  super::super::save(&mut c,"guest",&state.to_string()).unwrap();bind(&c,"guest").unwrap();
  let id="00000000-0000-4000-8000-000000000001";let rows=json!([{"title":"a"},{"title":"b"}]);
  assert_eq!(enqueue(&mut c,"guest",id,rows.clone()).unwrap()["status"],"received");
  assert!(!c.query_row("SELECT EXISTS(SELECT 1 FROM direct_capture_requests WHERE scope='guest' AND status='pending')",[],|r|r.get::<_,bool>(0)).unwrap());
  assert_eq!(super::super::pending_direct(&c,"guest").unwrap().unwrap().batch_count,Some(2));
  assert_eq!(enqueue(&mut c,"guest",id,rows.clone()).unwrap()["status"],"received");
  assert!(enqueue(&mut c,"guest",id,json!([{"title":"changed"}])).is_err());
  let mut s=state.clone();s["tasks"]=json!([{"id":format!("{id}:1")}]);super::super::save(&mut c,"guest",&s.to_string()).unwrap();assert_eq!(receipt(&c,"guest",id).unwrap()["status"],"received");
  s["tasks"]=json!([{"id":format!("{id}:1")},{"id":format!("{id}:2")}]);
  c.execute_batch("CREATE TRIGGER qa_abort BEFORE INSERT ON workspace_store BEGIN SELECT RAISE(ABORT,'QA rollback'); END;").unwrap();
  assert!(super::super::save_with_store(&mut c,"guest",&s.to_string(),Some("{}")).is_err());assert_eq!(receipt(&c,"guest",id).unwrap()["status"],"received");
  c.execute_batch("DROP TRIGGER qa_abort").unwrap();super::super::save(&mut c,"guest",&s.to_string()).unwrap();
  assert_eq!(receipt(&c,"guest",id).unwrap()["status"],"saved");assert_eq!(enqueue(&mut c,"guest",id,rows.clone()).unwrap()["task_ids"].as_array().unwrap().len(),2);
  assert!(enqueue(&mut c,"guest",id,json!([{"title":"changed"}])).is_err());
  let account="00000000-0000-4000-8000-000000000002";super::super::save(&mut c,account,&state.to_string()).unwrap();bind(&c,account).unwrap();
  assert!(receipt(&c,account,id).is_err());assert!(enqueue(&mut c,"guest",id,rows).is_err());
 }
 #[test]fn operation_receipt_is_atomic_scoped_and_idempotent(){
  let mut c=Connection::open_in_memory().unwrap();super::super::schema(&c).unwrap();
  let state=json!({"version":2,"lists":[{"id":"inbox","name":"收集箱"}],"tasks":[]});
  super::super::save(&mut c,"guest",&state.to_string()).unwrap();bind(&c,"guest").unwrap();
  let id="00000000-0000-4000-8000-000000000021";let other="00000000-0000-4000-8000-000000000022";
  let payload=json!({"op":"create","tasks":[{"title":"test","repeat":"daily"}]});
  assert_eq!(enqueue_operation(&mut c,"guest",id,payload.clone()).unwrap()["status"],"received");
  assert!(super::super::pending_direct(&c,"guest").unwrap().is_none());
  assert!(enqueue_operation(&mut c,"guest",other,json!({"op":"catalog"})).is_err());
  assert!(enqueue(&mut c,"guest",other,json!([{"title":"other"}])).is_err());
  let mut changed=state.clone();changed["tasks"]=json!([{"id":"created","title":"test","notes":""}]);
  let store=json!({"todo-workbench-v1":changed.to_string()}).to_string();
  let receipt_data=json!({"id":id,"status":"saved","result":{"task_ids":["created"]}});
  c.execute_batch("CREATE TRIGGER qa_fail BEFORE UPDATE ON cli_operation_meta BEGIN SELECT RAISE(ABORT,'QA rollback'); END;").unwrap();
  assert!(super::super::persist_store_receipt(&mut c,"guest",&store,Some(&receipt_data)).is_err());
  assert_eq!(receipt(&c,"guest",id).unwrap()["status"],"received");
  assert!(!super::super::direct_task_exists(&c,"guest","created").unwrap());
  c.execute_batch("DROP TRIGGER qa_fail").unwrap();
  super::super::persist_store_receipt(&mut c,"guest",&store,Some(&receipt_data)).unwrap();
  assert_eq!(receipt(&c,"guest",id).unwrap()["result"]["task_ids"][0],"created");
  assert_eq!(enqueue_operation(&mut c,"guest",id,payload.clone()).unwrap()["status"],"saved");
  assert!(enqueue_operation(&mut c,"guest",id,json!({"op":"catalog"})).is_err());
  // Lost IPC reply retry cannot overwrite a later workspace.
  super::super::save(&mut c,"guest",&state.to_string()).unwrap();
  super::super::persist_store_receipt(&mut c,"guest",&store,Some(&receipt_data)).unwrap();
  assert!(!super::super::direct_task_exists(&c,"guest","created").unwrap());
  super::super::save(&mut c,other,&state.to_string()).unwrap();bind(&c,other).unwrap();
  assert!(receipt(&c,other,id).is_err());assert!(enqueue_operation(&mut c,"guest",id,payload).is_err());
 }
 #[test]fn single_migration_backup_scope_and_gate(){
  use super::super::incremental_single as r3;
  let dir=std::env::temp_dir().join(format!("todo-r3-copy-{}",Uuid::new_v4()));std::fs::create_dir(&dir).unwrap();
  let mut c=Connection::open(dir.join("r3.sqlite3")).unwrap();
  let a=json!({"version":2,"tasks":[{"id":"qa","title":"synthetic","priority":0}]});
  let b=json!({"version":2,"tasks":[{"id":"qa","title":"other scope","priority":1}]});
  let k=json!({"todo-cloud-meta":"synthetic","todo-cloud-base":"opaque"});let other="00000000-0000-4000-8000-000000000001";
  r3::init(&mut c,"guest",&r3::wrap(&a,&k)).unwrap();
  super::super::persist_store(&mut c,other,&r3::wrap(&b,&k).to_string()).unwrap();bind(&c,"guest").unwrap();set_advanced(&c,"guest",true).unwrap();
  let id=Uuid::new_v4().to_string();let req=json!({"op":"update","id":"qa","fields":{"priority":3}});
  enqueue_operation(&mut c,"guest",&id,req.clone()).unwrap();
  assert!(r3::migrate(&mut c,"guest",&r3::wrap(&a,&k),false).unwrap_err().contains("pending"));
  let cancelled=json!({"id":id,"status":"cancelled","result":{"code":"QA"}});
  super::super::persist_store_receipt(&mut c,"guest",&r3::wrap(&a,&k).to_string(),Some(&cancelled)).unwrap();
  r3::migrate(&mut c,"guest",&r3::wrap(&a,&k),false).unwrap();r3::migrate(&mut c,other,&r3::wrap(&b,&k),false).unwrap();
  assert_eq!(receipt(&c,"guest",&id).unwrap()["status"],"cancelled");
  let mut n=a.clone();n["tasks"][0]["priority"]=json!(3);let p=r3::delta(&a,&n,&k,&k);
  assert!(r3::commit(&mut c,other,&Uuid::new_v4().to_string(),0,&p,None,false).is_err());
  let rid=Uuid::new_v4().to_string();enqueue_operation(&mut c,"guest",&rid,req).unwrap();
  let r=json!({"id":rid,"status":"saved","result":{"affected":1}});
  r3::commit(&mut c,"guest",&rid,0,&p,Some(&r),false).unwrap();
  assert_eq!(r3::export(&c,other).unwrap(),r3::wrap(&b,&k));
  let out=dir.join("legacy-copy.sqlite3");r3::export_legacy_copy(&c,&out,&BTreeMap::from([("guest".to_string(),1),(other.to_string(),0)])).unwrap();
  let mut old=Connection::open(&out).unwrap();
  assert_eq!(old.query_row("SELECT count(*) FROM r3_head",[],|r|r.get::<_,i64>(0)).unwrap(),0);
  let other_store:String=old.query_row("SELECT body FROM workspace_store WHERE scope=?1",[other],|r|r.get(0)).unwrap();assert_eq!(serde_json::from_str::<Value>(&other_store).unwrap(),r3::wrap(&b,&k));
  assert_eq!(receipt(&old,"guest",&rid).unwrap(),receipt(&c,"guest",&rid).unwrap());
  assert_eq!(super::super::operation_history::history_read(&old,"guest",true,300).unwrap()["head"],1);
  let raw:String=old.query_row("SELECT body FROM workspace_store WHERE scope='guest'",[],|r|r.get(0)).unwrap();
  assert_eq!(serde_json::from_str::<Value>(&raw).unwrap(),r3::wrap(&n,&k));
  let mut newer=n.clone();newer["tasks"][0]["title"]=json!("legacy changed");
  super::super::persist_store(&mut old,"guest",&r3::wrap(&newer,&k).to_string()).unwrap();
  assert_eq!(super::super::operation_history::history_read(&old,"guest",true,300).unwrap()["head"],2);
  assert_eq!(r3::export(&c,"guest").unwrap(),r3::wrap(&n,&k));
  assert!(r3::migrate(&mut old,"guest",&r3::wrap(&newer,&k),false).is_err());assert!(r3::migrate(&mut old,other,&r3::wrap(&b,&k),false).is_err());
  assert_eq!(old.query_row("PRAGMA integrity_check",[],|r|r.get::<_,String>(0)).unwrap(),"ok");
  drop((old,c));std::fs::remove_dir_all(dir).unwrap();
  println!("pending migration gate, scope, preserved receipts and verified separate legacy copy");
 }
 #[test]fn single_crash_child(){
  let Ok(dir)=std::env::var("TODO_R3_CRASH_DIR")else{return};
  let path=std::path::PathBuf::from(dir);let mut c=Connection::open(path.join("r3.sqlite3")).unwrap();
  use super::super::incremental_single as r3;
  let a:Value=serde_json::from_str(&std::fs::read_to_string(path.join("fixture.json")).unwrap()).unwrap();
  let mode=std::env::var("TODO_R3_MODE").unwrap();
  if mode=="migrate"{r3::migrate(&mut c,"guest",&a["store"],false).unwrap();}
  else{r3::commit(&mut c,"guest",a["receipt"]["id"].as_str().unwrap(),0,&a["patch"],Some(&a["receipt"]),false).unwrap();}
  std::fs::write(path.join("committed"),b"ready").unwrap();loop{std::thread::park()}
 }
 #[test]#[ignore]fn single_crash_boundaries(){
  use super::super::incremental_single as r3;
  use std::{process::{Command,Stdio},time::{Duration,Instant}};
  let dir=std::env::temp_dir().join(format!("todo-r3-crash-{}",Uuid::new_v4()));std::fs::create_dir(&dir).unwrap();let path=dir.join("r3.sqlite3");
  let a=json!({"version":2,"tasks":[{"id":"qa","title":"synthetic","priority":0}]});let mut b=a.clone();b["tasks"][0]["priority"]=json!(3);
  let k=json!({"todo-cloud-meta":"synthetic"});let rid=Uuid::new_v4().to_string();let req=json!({"op":"update","id":"qa","fields":{"priority":3}});
  let rv=json!({"id":rid,"status":"saved","result":{"affected":1}});
  let p=r3::delta(&a,&b,&k,&k);let store=r3::wrap(&a,&k);
  std::fs::write(dir.join("fixture.json"),json!({"store":store,"patch":p,"receipt":rv}).to_string()).unwrap();
  let mut c=Connection::open(&path).unwrap();r3::init(&mut c,"guest",&store).unwrap();bind(&c,"guest").unwrap();set_advanced(&c,"guest",true).unwrap();drop(c);
  for(mode,pre)in [("migrate",true),("migrate",false),("apply",true),("apply",false)]{
   if mode=="apply"&&pre{let mut c=Connection::open(&path).unwrap();enqueue_operation(&mut c,"guest",&rid,req.clone()).unwrap();}
   let marker=dir.join(if pre{"precommit"}else{"committed"});if marker.exists(){std::fs::remove_file(&marker).unwrap();}
   let mut cmd=Command::new(std::env::current_exe().unwrap());cmd.args(["cli::tests::single_crash_child","--exact","--nocapture"]).env("TODO_R3_CRASH_DIR",&dir).env("TODO_R3_MODE",mode).stdout(Stdio::null()).stderr(Stdio::null());
   if pre{cmd.env(if mode=="migrate"{"TODO_R3_MIGRATION_PRECOMMIT"}else{"TODO_R3_PRECOMMIT"},&marker);}
   let mut child=cmd.spawn().unwrap();let start=Instant::now();
   while !marker.exists()&&start.elapsed()<Duration::from_secs(12){if child.try_wait().unwrap().is_some(){break}std::thread::sleep(Duration::from_millis(10));}
   let ready=marker.exists();let wal=std::fs::metadata(dir.join("r3.sqlite3-wal")).map(|m|m.len()).unwrap_or(0);
   let _=child.kill();let status=child.wait().unwrap();assert!(ready&&wal>0&&!status.success(),"child boundary");
   let mut c=Connection::open(&path).unwrap();
   if mode=="migrate"&&pre{assert!(r3::export(&c,"guest").is_err());assert_eq!(c.query_row("SELECT count(*) FROM snapshots WHERE scope='guest'",[],|r|r.get::<_,i64>(0)).unwrap(),1);}
   else{let committed=mode=="apply"&&!pre;assert_eq!(r3::export(&c,"guest").unwrap(),r3::wrap(if committed{&b}else{&a},&k));assert_eq!(r3::revision(&c,"guest").unwrap(),if committed{1}else{0});
    assert_eq!(r3::journal(&c,"guest").unwrap()["head"],if committed{1}else{0});
    if mode=="apply"{assert_eq!(receipt(&c,"guest",&rid).unwrap()["status"],if committed{"saved"}else{"received"});}
    if committed{let old=r3::commit(&mut c,"guest",&rid,0,&p,Some(&rv),false).unwrap();assert_eq!(old.0,1);}
   }
   assert_eq!(c.query_row("PRAGMA integrity_check",[],|r|r.get::<_,String>(0)).unwrap(),"ok");
   println!("R3 crash mode={mode} precommit={pre} wal_bytes={wal} integrity=ok");
  }
  std::fs::remove_dir_all(dir).unwrap();
 }
 #[test]#[ignore]fn single_cost_matrix(){
  use super::super::incremental_single as r3;
  use std::time::Instant;
  fn stats(a:&mut [f64])->String{a.sort_by(|a,b|a.total_cmp(b));let n=a.len();format!("{:.3}/{:.3}/{:.3}/{:.3}",(a[(n-1)/2]+a[n/2])/2.,a[((n as f64*0.95).ceil() as usize)-1],a[((n as f64*0.99).ceil() as usize)-1],a[n-1])}
  for(n,samples)in [(1000,60),(10000,60)]{
   let dir=std::env::temp_dir().join(format!("todo-r3-bench-{}",Uuid::new_v4()));std::fs::create_dir(&dir).unwrap();
   let mut old=Connection::open(dir.join("old.sqlite3")).unwrap();let mut new=Connection::open(dir.join("r3.sqlite3")).unwrap();
   let mut state=json!({"version":2,"tasks":(0..n).map(|i|json!({"id":format!("qa-{i}"),"title":format!("synthetic {i}"),"notes":"synthetic","priority":0,"activity":(0..5).map(|j|json!({"id":format!("qa-{i}-{j}"),"category":"property","kind":"priority","changes":[{"field":"priority","before":"0","after":"1"}]})).collect::<Vec<_>>() })).collect::<Vec<_>>()});
   let k=json!({"todo-cloud-meta":"synthetic"});let store=r3::wrap(&state,&k);
   super::super::schema(&old).unwrap();super::super::persist_store(&mut old,"guest",&store.to_string()).unwrap();r3::init(&mut new,"guest",&store).unwrap();
   for c in [&old,&new]{bind(c,"guest").unwrap();set_advanced(c,"guest",true).unwrap();}
   let t=Instant::now();r3::migrate(&mut new,"guest",&store,false).unwrap();let migration=t.elapsed().as_secs_f64()*1000.;
   for c in [&old,&new]{c.execute_batch("PRAGMA wal_autocheckpoint=0; PRAGMA wal_checkpoint(TRUNCATE)").unwrap();}
   let mut a=vec![];let mut b=vec![];
   for i in 0..samples{
    let before=state["tasks"][i].clone();state["tasks"][i]["priority"]=json!(3);state["tasks"][i]["title"]=json!(format!("edited {i}"));
    let rid=Uuid::new_v4().to_string();let req=json!({"op":"update","id":before["id"],"fields":{"priority":3,"title":state["tasks"][i]["title"]}});
    let rv=json!({"id":rid,"status":"saved","result":{"affected":1,"userConfirmation":{"method":"desktop-modal","at":Local::now().to_rfc3339()}}});
    let t=Instant::now();enqueue_operation(&mut old,"guest",&rid,req.clone()).unwrap();
    super::super::persist_store_receipt(&mut old,"guest",&r3::wrap(&state,&k).to_string(),Some(&rv)).unwrap();a.push(t.elapsed().as_secs_f64()*1000.);
    let t=Instant::now();enqueue_operation(&mut new,"guest",&rid,req).unwrap();
    let p=json!({"put":[{"id":before["id"],"before":before,"after":state["tasks"][i]}],"remove":[],"order":null,"meta":null,"keys":[]});
    r3::commit(&mut new,"guest",&rid,i as i64,&p,Some(&rv),false).unwrap();b.push(t.elapsed().as_secs_f64()*1000.);
    assert_eq!(receipt(&new,"guest",&rid).unwrap(),receipt(&old,"guest",&rid).unwrap());
    if i%10==9||i+1==samples{r3::compare(&new,&old,"guest");}
   }
   let size=|name:&str|std::fs::metadata(dir.join(name)).map(|m|m.len()).unwrap_or(0);
   for c in [&old,&new]{assert_eq!(c.query_row("PRAGMA integrity_check",[],|r|r.get::<_,String>(0)).unwrap(),"ok");}
   println!("R3 matrix tasks={n} samples={samples} migration_ms={migration:.3} full_ms={} row_ms={} full_wal={} row_wal={} full_db={} row_db={}",stats(&mut a),stats(&mut b),size("old.sqlite3-wal"),size("r3.sqlite3-wal"),size("old.sqlite3"),size("r3.sqlite3"));
   drop((old,new));std::fs::remove_dir_all(dir).unwrap();
  }
 }
 #[test]fn single_history_proposals_and_receipts(){
  let (Ok(script),Ok(fixtures))=(std::env::var("TODO_R3_PROPOSAL"),std::env::var("TODO_R3_FIXTURES"))else{return};
  use super::super::incremental_single as r3;
  use std::{io::Write,process::{Command,Stdio}};
  let fixture:Value=serde_json::from_str(&std::fs::read_to_string(fixtures).unwrap()).unwrap();
  for lifecycle in [false,true]{
   let (base,next)=if lifecycle{(fixture["steps"][3]["state"].clone(),fixture["steps"][4]["state"].clone())}else{let base=fixture["base"].clone();let mut next=base.clone();next["tasks"][0]["priority"]=json!(3);(base,next)};
   let k=json!({"todo-cloud-meta":"synthetic"});let mut c=Connection::open_in_memory().unwrap();let mut oracle=Connection::open_in_memory().unwrap();
   r3::init(&mut c,"guest",&r3::wrap(&base,&k)).unwrap();super::super::schema(&oracle).unwrap();super::super::persist_store(&mut oracle,"guest",&r3::wrap(&base,&k).to_string()).unwrap();
   for db in [&mut c,&mut oracle]{bind(db,"guest").unwrap();super::super::persist_store(db,"guest",&r3::wrap(&next,&k).to_string()).unwrap();}
   let preview_id="00000000-0000-4000-8000-000000000081";let apply_id="00000000-0000-4000-8000-000000000082";
   let preview_req=json!({"op":"history-preview","version":1});let apply_req=json!({"op":"history-apply","previewId":preview_id,"confirm":true});
   r3::migrate(&mut c,"guest",&r3::wrap(&next,&k),false).unwrap();r3::compare(&c,&oracle,"guest");
   for db in [&mut c,&mut oracle]{assert!(enqueue_operation(db,"guest",preview_id,preview_req.clone()).is_err());set_advanced(db,"guest",true).unwrap();enqueue_operation(db,"guest",preview_id,preview_req.clone()).unwrap();}
   let run=|request:&Value,id:&str,reference:Value,d:&Value,journal:Value|{
    let mut child=Command::new("node").arg(&script).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().unwrap();
    child.stdin.take().unwrap().write_all(json!({"state":d,"request":request,"id":id,"reference":reference,"journal":journal}).to_string().as_bytes()).unwrap();
    let out=child.wait_with_output().unwrap();assert!(out.status.success(),"{}",String::from_utf8_lossy(&out.stderr));serde_json::from_slice::<Value>(&out.stdout).unwrap()
   };
   let j=r3::journal(&c,"guest").unwrap();let proposal=run(&preview_req,preview_id,Value::Null,&next,j.clone());
   assert_eq!(proposal["next"],next);assert_eq!(proposal["result"]["rows"].as_array().unwrap().len(),1);
   let pr=json!({"id":preview_id,"status":"saved","result":proposal["result"]});
   r3::commit(&mut c,"guest",preview_id,0,&r3::delta(&next,&next,&k,&k),Some(&pr),false).unwrap();
   super::super::persist_store_receipt(&mut oracle,"guest",&r3::wrap(&next,&k).to_string(),Some(&pr)).unwrap();
   for db in [&mut c,&mut oracle]{enqueue_operation(db,"guest",apply_id,apply_req.clone()).unwrap();}
   let result=run(&apply_req,apply_id,json!({"id":preview_id,"kind":"history-preview","status":"saved","result":proposal["result"]}),&next,j);
   let restored=&result["next"];
   if lifecycle{assert_eq!(restored["tasks"].as_array().unwrap().iter().find(|t|t["id"]=="b").unwrap()["status"],"pending");assert_eq!(result["result"]["pointsImpact"],json!({"before":5,"after":0}));}
   else{assert_eq!(restored["tasks"][0]["priority"],0);}
   let rv=json!({"id":apply_id,"status":"saved","result":result["result"]});let mut p=result["patch"].clone();p["keys"]=json!([]);
   let mut invalid=rv.clone();invalid["result"]["userConfirmation"]=Value::Null;
   assert!(r3::commit(&mut c,"guest",apply_id,1,&p,Some(&invalid),false).unwrap_err().contains("confirmation"));
   let mut extra=restored.clone();extra["tasks"][0]["notes"]=json!("not approved");let bad=r3::delta(&next,&extra,&k,&k);
   assert!(r3::commit(&mut c,"guest",apply_id,1,&bad,Some(&rv),false).unwrap_err().contains("exceeds preview"));
   assert!(r3::commit(&mut c,"guest",apply_id,1,&p,Some(&rv),true).is_err());r3::compare(&c,&oracle,"guest");
   assert_eq!(receipt(&c,"guest",apply_id).unwrap()["status"],"received");
   let saved=r3::commit(&mut c,"guest",apply_id,1,&p,Some(&rv),false).unwrap();
   super::super::persist_store_receipt(&mut oracle,"guest",&r3::wrap(restored,&k).to_string(),Some(&rv)).unwrap();
   r3::compare(&c,&oracle,"guest");assert_eq!(receipt(&c,"guest",apply_id).unwrap(),receipt(&oracle,"guest",apply_id).unwrap());
   // A newer manual change must survive a lost ACK retry.
   let mut later=restored.clone();later["theme"]=json!("dark");let p2=r3::delta(restored,&later,&k,&k);
   r3::commit(&mut c,"guest",&Uuid::new_v4().to_string(),2,&p2,None,false).unwrap();super::super::persist_store(&mut oracle,"guest",&r3::wrap(&later,&k).to_string()).unwrap();
   assert_eq!(r3::commit(&mut c,"guest",apply_id,1,&p,Some(&rv),false).unwrap(),saved);r3::compare(&c,&oracle,"guest");
   let redo_preview="00000000-0000-4000-8000-000000000083";let redo_id="00000000-0000-4000-8000-000000000084";
   let req=json!({"op":"history-preview","version":2});let apply=json!({"op":"history-apply","previewId":redo_preview,"confirm":true});
   for db in [&mut c,&mut oracle]{enqueue_operation(db,"guest",redo_preview,req.clone()).unwrap();}
   let j=r3::journal(&c,"guest").unwrap();let pr=run(&req,redo_preview,Value::Null,&later,j.clone());
   let rv=json!({"id":redo_preview,"status":"saved","result":pr["result"]});
   r3::commit(&mut c,"guest",redo_preview,3,&r3::delta(&later,&later,&k,&k),Some(&rv),false).unwrap();
   super::super::persist_store_receipt(&mut oracle,"guest",&r3::wrap(&later,&k).to_string(),Some(&rv)).unwrap();
   for db in [&mut c,&mut oracle]{enqueue_operation(db,"guest",redo_id,apply.clone()).unwrap();}
   let redo=run(&apply,redo_id,json!({"id":redo_preview,"kind":"history-preview","status":"saved","result":pr["result"]}),&later,j);
   if lifecycle{let t=redo["next"]["tasks"].as_array().unwrap().iter().find(|t|t["id"]=="b").unwrap();let old=next["tasks"].as_array().unwrap().iter().find(|t|t["id"]=="b").unwrap();assert_eq!(t["completedAt"],old["completedAt"]);assert_eq!(redo["result"]["pointsImpact"],json!({"before":0,"after":5}));}else{assert_eq!(redo["next"]["tasks"][0]["priority"],3);}
   assert_eq!(redo["next"]["theme"],"dark");
   let rv=json!({"id":redo_id,"status":"saved","result":redo["result"]});
   r3::commit(&mut c,"guest",redo_id,4,&r3::delta(&later,&redo["next"],&k,&k),Some(&rv),false).unwrap();
   super::super::persist_store_receipt(&mut oracle,"guest",&r3::wrap(&redo["next"],&k).to_string(),Some(&rv)).unwrap();
   r3::compare(&c,&oracle,"guest");assert_eq!(receipt(&c,"guest",redo_id).unwrap(),receipt(&oracle,"guest",redo_id).unwrap());
   println!("R3 history lifecycle={lifecycle}, advanced gate, confirmation, exact diff, atomic receipt, lost ACK, redo and newer edit verified");
  }
 }
 #[test]fn shadow_history_real_proposal_and_receipt(){
  let (Ok(script),Ok(fixtures))=(std::env::var("TODO_R2_PROPOSAL"),std::env::var("TODO_R2_FIXTURES"))else{return};
  use super::super::incremental_shadow as sh;
  use std::{io::Write,process::{Command,Stdio}};
  let fixture:Value=serde_json::from_str(&std::fs::read_to_string(fixtures).unwrap()).unwrap();
  for lifecycle in [false,true]{
  let (base,next)=if lifecycle{(fixture["steps"][3]["state"].clone(),fixture["steps"][4]["state"].clone())}else{let base=fixture["base"].clone();let mut next=base.clone();next["tasks"][0]["priority"]=json!(3);(base,next)};
  let mut c=sh::db();let mut refdb=Connection::open_in_memory().unwrap();super::super::schema(&refdb).unwrap();
  sh::persist(&mut c,"guest",&sh::wrapped(&base),None,json!({"kind":"snapshot"}),false).unwrap();
  super::super::persist_store(&mut refdb,"guest",&sh::wrapped(&base).to_string()).unwrap();
  let p=sh::delta(&c,"guest",&base,&next);sh::persist(&mut c,"guest",&sh::wrapped(&next),None,p,false).unwrap();
  super::super::persist_store(&mut refdb,"guest",&sh::wrapped(&next).to_string()).unwrap();
  let preview_id="00000000-0000-4000-8000-000000000071";let apply_id="00000000-0000-4000-8000-000000000072";
  let preview_req=json!({"op":"history-preview","version":1});let apply_req=json!({"op":"history-apply","previewId":preview_id,"confirm":true});
  for db in [&mut c,&mut refdb]{bind(db,"guest").unwrap();assert!(enqueue_operation(db,"guest",preview_id,preview_req.clone()).is_err());set_advanced(db,"guest",true).unwrap();enqueue_operation(db,"guest",preview_id,preview_req.clone()).unwrap();}
  let run=|request:&Value,id:&str,reference:Value,d:&Value,journal:Value|{
   let mut child=Command::new("node").arg(&script).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().unwrap();
   child.stdin.take().unwrap().write_all(json!({"state":d,"request":request,"id":id,"reference":reference,"journal":journal}).to_string().as_bytes()).unwrap();
   let out=child.wait_with_output().unwrap();assert!(out.status.success(),"{}",String::from_utf8_lossy(&out.stderr));
   serde_json::from_slice::<Value>(&out.stdout).unwrap()
  };
  let j=super::super::operation_history::history_read(&c,"guest",true,300).unwrap();
  let proposal=run(&preview_req,preview_id,Value::Null,&next,j.clone());
  assert_eq!(proposal["next"],next);assert_eq!(proposal["result"]["rows"].as_array().unwrap().len(),1);
  let pr=json!({"id":preview_id,"status":"saved","result":proposal["result"]});
  let p=sh::delta(&c,"guest",&next,&next);sh::persist(&mut c,"guest",&sh::wrapped(&next),Some(&pr),p,false).unwrap();
  super::super::persist_store_receipt(&mut refdb,"guest",&sh::wrapped(&next).to_string(),Some(&pr)).unwrap();
  for db in [&mut c,&mut refdb]{enqueue_operation(db,"guest",apply_id,apply_req.clone()).unwrap();}
  let result=run(&apply_req,apply_id,json!({"id":preview_id,"kind":"history-preview","status":"saved","result":proposal["result"]}),&next,j);
  let restored=&result["next"];
  if lifecycle{let task=restored["tasks"].as_array().unwrap().iter().find(|t|t["id"]=="b").unwrap();assert_eq!(task["status"],"pending");assert_eq!(task["points"],5);assert_eq!(result["result"]["pointsImpact"],json!({"before":5,"after":0}));}
  else{assert_eq!(restored["tasks"][0]["priority"],0);}
  let receipt_value=json!({"id":apply_id,"status":"saved","result":result["result"]});
  let p=sh::delta(&c,"guest",&next,restored);
  let mut invalid=receipt_value.clone();invalid["result"]["userConfirmation"]=Value::Null;
  assert!(sh::persist(&mut c,"guest",&sh::wrapped(restored),Some(&invalid),p.clone(),false).unwrap_err().contains("confirmation"));
  assert!(sh::persist(&mut c,"guest",&sh::wrapped(restored),Some(&receipt_value),p.clone(),true).is_err());sh::check(&c,"guest",&next);
  assert_eq!(receipt(&c,"guest",apply_id).unwrap()["status"],"received");
  sh::persist(&mut c,"guest",&sh::wrapped(restored),Some(&receipt_value),p.clone(),false).unwrap();
  super::super::persist_store_receipt(&mut refdb,"guest",&sh::wrapped(restored).to_string(),Some(&receipt_value)).unwrap();
  sh::check(&c,"guest",restored);sh::compare(&c,&refdb,"guest");
  assert_eq!(receipt(&c,"guest",apply_id).unwrap(),receipt(&refdb,"guest",apply_id).unwrap());
  let saved=receipt(&c,"guest",apply_id).unwrap();assert_eq!(saved["status"],"saved");
  sh::persist(&mut c,"guest",&sh::wrapped(restored),Some(&receipt_value),p,false).unwrap();assert_eq!(receipt(&c,"guest",apply_id).unwrap(),saved);
  println!("actual JS preview/apply lifecycle={lifecycle}; actual native guard, shadow rollback, advanced scope, receipt equality, duplicate retry passed");
  }
 }
 #[test]fn history_receipt_restart_and_lost_ack(){
  let path=std::env::temp_dir().join(format!("todo-history-qa-{}.sqlite3",uuid::Uuid::new_v4()));
  let base=json!({"version":2,"tasks":[{"id":"qa","title":"synthetic","priority":3}]});
  let mut next=base.clone();next["tasks"][0]["priority"]=json!(0);
  let store=json!({"todo-workbench-v1":next.to_string()}).to_string();
  let id="00000000-0000-4000-8000-000000000099";
  let payload=json!({"op":"history-apply","previewId":"00000000-0000-4000-8000-000000000098","confirm":true});
  let preview_id="00000000-0000-4000-8000-000000000098";
  let stamp=Local::now().to_rfc3339();
  let rows=json!([{"id":"qa","fields":{"priority":{"before":{"present":true,"value":3},"after":{"present":true,"value":0}}}}]);
  let preview_result=json!({"head":0,"generatedAt":stamp,"workspaceVersion":format!("{:x}",Sha256::digest(base.to_string().as_bytes())),"rows":rows,"conflicts":[],"pointsImpact":null});
  let result=json!({"id":id,"status":"saved","result":{"affected":1,"preview_id":preview_id,"rows":rows,"conflicts":[],"pointsImpact":null,"userConfirmation":{"method":"desktop-modal","at":stamp}}});
  {
   let mut c=Connection::open(&path).unwrap();super::super::schema(&c).unwrap();
   super::super::save(&mut c,"guest",&base.to_string()).unwrap();bind(&c,"guest").unwrap();set_advanced(&c,"guest",true).unwrap();
   enqueue_operation(&mut c,"guest",preview_id,json!({"op":"history-preview","version":1})).unwrap();
   let initial_store=json!({"todo-workbench-v1":base.to_string()}).to_string();
   super::super::persist_store_receipt(&mut c,"guest",&initial_store,Some(&json!({"id":preview_id,"status":"saved","result":preview_result}))).unwrap();
   enqueue_operation(&mut c,"guest",id,payload.clone()).unwrap();
   let mut invalid=result.clone();invalid["result"]["userConfirmation"]=Value::Null;
   assert!(super::super::persist_store_receipt(&mut c,"guest",&store,Some(&invalid)).unwrap_err().contains("confirmation"));
   let mut extra=next.clone();extra["tasks"][0]["title"]=json!("unapproved");
   let extra_store=json!({"todo-workbench-v1":extra.to_string()}).to_string();
   assert!(super::super::persist_store_receipt(&mut c,"guest",&extra_store,Some(&result)).unwrap_err().contains("exceeds preview"));
   c.execute_batch("CREATE TRIGGER qa_failure BEFORE UPDATE ON cli_operation_meta BEGIN SELECT RAISE(ABORT,'injected'); END;").unwrap();
   assert!(super::super::persist_store_receipt(&mut c,"guest",&store,Some(&result)).is_err());
   assert_eq!(super::super::operation_history::history_read(&c,"guest",true,300).unwrap()["head"],0);
   c.execute_batch("DROP TRIGGER qa_failure").unwrap();
  }
  {
   let mut c=Connection::open(&path).unwrap();
   assert_eq!(receipt(&c,"guest",id).unwrap()["status"],"received");
   super::super::persist_store_receipt(&mut c,"guest",&store,Some(&result)).unwrap();
   assert_eq!(super::super::operation_history::history_read(&c,"guest",true,300).unwrap()["head"],1);
  }
  {
   let mut c=Connection::open(&path).unwrap();
   assert_eq!(enqueue_operation(&mut c,"guest",id,payload).unwrap()["status"],"saved");
   super::super::save(&mut c,"guest",&base.to_string()).unwrap();
   super::super::persist_store_receipt(&mut c,"guest",&store,Some(&result)).unwrap();
   assert_eq!(super::super::operation_history::history_read(&c,"guest",true,300).unwrap()["head"],2);
   assert_eq!(c.query_row("PRAGMA integrity_check",[],|r|r.get::<_,String>(0)).unwrap(),"ok");
  }
  std::fs::remove_file(path).unwrap();
 }
 // Child-process fault injection runs only under the Rust test harness.
 #[test]fn history_crash_child(){
  let Ok(dir)=std::env::var("TODO_TEST_HISTORY_CRASH_DIR")else{return};
  let dir=std::path::PathBuf::from(dir);
  let mut c=Connection::open(dir.join("qa.sqlite3")).unwrap();
  let store=std::fs::read_to_string(dir.join("store.json")).unwrap();
  let result:Value=serde_json::from_str(&std::fs::read_to_string(dir.join("receipt.json")).unwrap()).unwrap();
  super::super::persist_store_receipt(&mut c,"guest",&store,Some(&result)).unwrap();
  std::fs::write(dir.join("committed"),b"committed").unwrap();
  loop{std::thread::park();}
 }
 #[test]#[ignore]fn history_wal_process_kill(){
  use std::{process::{Command,Stdio},time::{Duration,Instant}};
  let dir=std::env::temp_dir().join(format!("todo-history-crash-{}",uuid::Uuid::new_v4()));std::fs::create_dir(&dir).unwrap();
  let db=dir.join("qa.sqlite3");
  let id="00000000-0000-4000-8000-000000000091";
  let preview_id="00000000-0000-4000-8000-000000000092";
  let base=json!({"version":2,"tasks":[{"id":"qa","title":"synthetic","priority":3}]});
  let mut next=base.clone();next["tasks"][0]["priority"]=json!(0);
  let stamp=Local::now().to_rfc3339();
  let rows=json!([{"id":"qa","fields":{"priority":{"before":{"present":true,"value":3},"after":{"present":true,"value":0}}}}]);
  let result=json!({"id":id,"status":"saved","result":{"affected":1,"preview_id":preview_id,"rows":rows,"conflicts":[],"pointsImpact":null,"userConfirmation":{"method":"desktop-modal","at":stamp}}});
  let payload=json!({"op":"history-apply","previewId":preview_id,"confirm":true});
  let store=json!({"todo-workbench-v1":next.to_string()}).to_string();
  std::fs::write(dir.join("store.json"),&store).unwrap();std::fs::write(dir.join("receipt.json"),result.to_string()).unwrap();
  {
   let mut c=Connection::open(&db).unwrap();super::super::schema(&c).unwrap();super::super::save(&mut c,"guest",&base.to_string()).unwrap();bind(&c,"guest").unwrap();set_advanced(&c,"guest",true).unwrap();
   enqueue_operation(&mut c,"guest",preview_id,json!({"op":"history-preview","version":1})).unwrap();
   let p=json!({"head":0,"generatedAt":stamp,"workspaceVersion":format!("{:x}",Sha256::digest(base.to_string().as_bytes())),"rows":rows,"conflicts":[],"pointsImpact":null});
   super::super::persist_store_receipt(&mut c,"guest",&json!({"todo-workbench-v1":base.to_string()}).to_string(),Some(&json!({"id":preview_id,"status":"saved","result":p}))).unwrap();
   enqueue_operation(&mut c,"guest",id,payload.clone()).unwrap();
  }
  for precommit in [true,false]{
   let marker=dir.join(if precommit{"precommit"}else{"committed"});
   let mut cmd=Command::new(std::env::current_exe().unwrap());cmd.args(["history_crash_child","--nocapture"]).env("TODO_TEST_HISTORY_CRASH_DIR",&dir).stdout(Stdio::null()).stderr(Stdio::null());
   if precommit{cmd.env("TODO_TEST_HISTORY_PRECOMMIT_MARKER",&marker);}
   let mut child=cmd.spawn().unwrap();let start=Instant::now();
   while !marker.exists()&&start.elapsed()<Duration::from_secs(10){if child.try_wait().unwrap().is_some(){break}std::thread::sleep(Duration::from_millis(20));}
   let ready=marker.exists();let wal=std::fs::metadata(dir.join("qa.sqlite3-wal")).map(|m|m.len()).unwrap_or(0);
   let _=child.kill();let status=child.wait().unwrap();assert!(ready&&wal>0&&!status.success(),"child did not reach boundary");
   let mut c=Connection::open(&db).unwrap();
   let raw:String=c.query_row("SELECT body FROM snapshots WHERE scope='guest'",[],|r|r.get(0)).unwrap();
   assert_eq!(serde_json::from_str::<Value>(&raw).unwrap(),if precommit{base.clone()}else{next.clone()});
   let h=super::super::operation_history::history_read(&c,"guest",true,300).unwrap();assert_eq!(h["head"],if precommit{0}else{1});
   assert_eq!(receipt(&c,"guest",id).unwrap()["status"],if precommit{"received"}else{"saved"});
   assert_eq!(c.query_row("PRAGMA integrity_check",[],|r|r.get::<_,String>(0)).unwrap(),"ok");
   if !precommit{assert_eq!(enqueue_operation(&mut c,"guest",id,payload.clone()).unwrap()["status"],"saved");}
   println!("crash boundary={} wal_bytes={} integrity=ok head={} receipt={}",if precommit{"precommit"}else{"postcommit-before-ack"},wal,h["head"],receipt(&c,"guest",id).unwrap()["status"]);
  }
  std::fs::remove_dir_all(dir).unwrap();
 }
 #[test]fn every_v4_operation_has_explicit_scope_gate(){
  let schema:Value=serde_json::from_str(include_str!("../../docs/ai-integration/cli-schema.json")).unwrap();
  let advertised=schema["operations"].as_object().unwrap();
  let actual:std::collections::BTreeSet<_>=OPERATIONS.iter().chain(MANAGEMENT).chain(HISTORY).copied().collect();
  assert_eq!(actual.len(),34);
  assert_eq!(actual,advertised.keys().map(String::as_str).collect());
  let id="00000000-0000-4000-8000-000000000093";
  let base=json!({"version":2,"tasks":[]});
  for kind in actual{
   let mut c=Connection::open_in_memory().unwrap();super::super::schema(&c).unwrap();
   super::super::save(&mut c,"guest",&base.to_string()).unwrap();bind(&c,"guest").unwrap();
   let payload=json!({"op":kind});
   if kind=="create"{assert_eq!(enqueue_operation(&mut c,"guest",id,payload).unwrap()["status"],"received");continue}
   assert!(enqueue_operation(&mut c,"guest",id,payload.clone()).unwrap_err().contains("advanced"));
   set_advanced(&c,"guest",true).unwrap();
   assert_eq!(enqueue_operation(&mut c,"guest",id,payload).unwrap()["status"],"received");
  }
  let mut c=Connection::open_in_memory().unwrap();super::super::schema(&c).unwrap();super::super::save(&mut c,"guest",&base.to_string()).unwrap();bind(&c,"guest").unwrap();set_advanced(&c,"guest",true).unwrap();
  c.execute_batch("DROP TABLE operation_history_head; DROP TABLE cli_management_v3;").unwrap();
  for kind in HISTORY.iter().chain(MANAGEMENT){assert!(enqueue_operation(&mut c,"guest",id,json!({"op":kind})).unwrap_err().contains("updated native application"))}
  assert_eq!(enqueue_operation(&mut c,"guest",id,json!({"op":"catalog"})).unwrap()["status"],"received");
 }
 #[test]fn advanced_access_is_explicit_and_cannot_change_while_pending(){
  let mut c=Connection::open_in_memory().unwrap();super::super::schema(&c).unwrap();
  let state=json!({"version":2,"tasks":[]});let raw=state.to_string();super::super::save(&mut c,"guest",&raw).unwrap();bind(&c,"guest").unwrap();
  let id="00000000-0000-4000-8000-000000000023";let other="00000000-0000-4000-8000-000000000024";
  assert!(enqueue_operation(&mut c,"guest",id,json!({"op":"catalog"})).is_err());
  set_advanced(&c,"guest",true).unwrap();
  assert_eq!(enqueue_operation(&mut c,"guest",id,json!({"op":"catalog"})).unwrap()["status"],"received");
  assert!(set_advanced(&c,"guest",false).is_err());assert!(unbind(&c,None).is_err());
  super::super::save(&mut c,other,&raw).unwrap();assert!(bind(&c,other).is_err());
  let store=json!({"todo-workbench-v1":raw}).to_string();
  super::super::persist_store_receipt(&mut c,"guest",&store,Some(&json!({"id":id,"status":"saved","result":{"private":"test"}}))).unwrap();
  assert_eq!(receipt(&c,"guest",id).unwrap()["result"]["private"],"test");
  set_advanced(&c,"guest",false).unwrap();
  assert_eq!(receipt(&c,"guest",id).unwrap()["result_access"],"not_authorized");
  bind(&c,other).unwrap();assert!(!advanced_scope(&c,other).unwrap());
 }
 #[test]fn management_result_expiry_preserves_idempotency(){
  let mut c=Connection::open_in_memory().unwrap();super::super::schema(&c).unwrap();
  let state=json!({"version":2,"tasks":[]});let raw=state.to_string();super::super::save(&mut c,"guest",&raw).unwrap();bind(&c,"guest").unwrap();set_advanced(&c,"guest",true).unwrap();
  let id="00000000-0000-4000-8000-000000000031";let other="00000000-0000-4000-8000-000000000032";
  let payload=json!({"op":"context"});
  assert_eq!(enqueue_operation(&mut c,"guest",id,payload.clone()).unwrap()["status"],"received");
  let store=json!({"todo-workbench-v1":raw}).to_string();
  super::super::persist_store_receipt(&mut c,"guest",&store,Some(&json!({"id":id,"status":"saved","result":{"private":"qa"}}))).unwrap();
  c.execute("UPDATE direct_capture_requests SET created_at=?1 WHERE id=?2",params![Local::now().timestamp()-8*86400,id]).unwrap();
  assert_eq!(receipt(&c,"guest",id).unwrap()["result_access"],"expired");
  assert_eq!(enqueue_operation(&mut c,"guest",id,payload).unwrap()["status"],"saved");
  assert!(enqueue_operation(&mut c,"guest",id,json!({"op":"audit"})).is_err());
  assert!(c.query_row("SELECT result IS NULL FROM cli_operation_meta WHERE id=?1",[id],|r|r.get::<_,bool>(0)).unwrap());
  assert_eq!(enqueue_operation(&mut c,"guest",other,json!({"op":"review"})).unwrap()["status"],"received");
 }
 #[test]fn strict_batch_validation(){
  for bad in [json!([{"title":"x","date":"2026-02-30"}]),json!([{"title":"x","date":"2026-1-001"}]),json!([{"title":"x","time":"10:00"}]),json!([{"title":"x","status":"done"}]),json!([{"title":"x","reminderAt":"2026-11-26T25:00"}])]{assert!(normalized(bad).is_err())}
  assert_eq!(normalized(json!([{"title":" a ","priority":0}])).unwrap(),json!([{"title":"a","priority":0}]));
 }
}
