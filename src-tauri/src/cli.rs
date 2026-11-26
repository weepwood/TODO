//! Local CLI uses only the existing durable intake queue. The application owns
//! workspace writes. Binding is explicit and never follows a login change.
use chrono::{Local,NaiveDate,NaiveTime,Days};
use rusqlite::{Connection,OpenFlags,OptionalExtension,params,TransactionBehavior};
use serde_json::{Value,json};
use sha2::{Sha256,Digest};
use std::{path::PathBuf,time::{Duration,Instant},io::{Read,self},collections::BTreeMap};
use uuid::Uuid;
type Res<T>=Result<T,String>;
const HELP:&str="TODO local CLI\n  todo doctor\n  todo lists\n  todo add TITLE [--date YYYY-MM-DD|today|tomorrow|day-after-tomorrow] [--time HH:mm] [--list NAME | --list-id ID] [--priority none|low|medium|high] [--duration MIN] [--notes TEXT] [--deadline YYYY-MM-DD] [--reminder-at YYYY-MM-DDTHH:mm] [--request-id UUID] [--wait SECONDS]\n  todo batch --file PATH|- [--request-id UUID] [--wait SECONDS]\n  todo status UUID\n  todo bind --scope guest|UUID (explicit local workspace)\n  todo unbind\nOptions before command: --data-dir PATH (isolated installation only; default macOS TODO app data).\nBind the desired workspace in TODO Settings > Account & Sync before use.\nreceived is queued, saved is durable local commit; cloud sync is not asserted.\nA single request can be pending per bound workspace; retry with the same UUID and content.\n";
pub(super) fn bound_scope(c:&Connection)->Res<Option<String>>{c.query_row("SELECT scope FROM cli_binding WHERE slot=1",[],|r|r.get(0)).optional().map_err(|e|e.to_string())}
pub(super) fn bind(c:&Connection,scope:&str)->Res<()>{
 if !super::valid_scope(scope)||scope!="guest"&&Uuid::parse_str(scope).is_err(){return Err("invalid scope".into())}
 let exists:bool=c.query_row("SELECT EXISTS(SELECT 1 FROM snapshots WHERE scope=?1)",[scope],|r|r.get(0)).map_err(|e|e.to_string())?;
 if !exists{return Err("workspace not initialized; open TODO and wait for local save".into())}
 c.execute("INSERT INTO cli_binding(slot,scope) VALUES(1,?1) ON CONFLICT(slot) DO UPDATE SET scope=excluded.scope",[scope]).map_err(|e|e.to_string())?;Ok(())
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
fn receipt(c:&Connection,scope:&str,id:&str)->Res<Value>{
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
 if super::direct_status(&tx,scope,id).map_err(|e|e.to_string())?.is_some(){return Err("request ID conflicts with legacy capture".into())}
 let avail=lists(&tx,scope)?;
 for r in rows.as_array().unwrap(){let target=r["listId"].as_str().unwrap_or("inbox");if !avail.iter().any(|l|l["id"]==target){return Err("target list not found".into())}}
 for i in 1..=count{if super::direct_task_exists(&tx,scope,&format!("{id}:{i}")).map_err(|e|e.to_string())?{return Err("task ID already exists".into())}}
 let pending:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM direct_capture_requests WHERE (scope=?1 OR scope='cli:'||?1) AND status='pending')",[scope],|r|r.get(0)).map_err(|e|e.to_string())?;
 if pending{return Err("another capture is pending; retry this request with same UUID later".into())}
 tx.execute("INSERT INTO direct_capture_requests(scope,id,generation,text,status,created_at) VALUES(?1,?2,0,?3,'pending',?4)",params![&queue_scope,id,raw,Local::now().timestamp()]).map_err(|e|e.to_string())?;
 tx.execute("INSERT INTO cli_capture_meta(scope,id,digest,task_count) VALUES(?1,?2,?3,?4)",params![&queue_scope,id,digest,count]).map_err(|e|e.to_string())?;
 let r=receipt(&tx,scope,id)?;tx.commit().map_err(|e|e.to_string())?;Ok(r)
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
 Ok(json!([r]))
}
fn request_id(s:Option<&String>)->Res<String>{match s{Some(s)=>Ok(Uuid::parse_str(s).map_err(|_|"invalid request UUID")?.to_string()),None=>Ok(Uuid::new_v4().to_string())}}
fn main_inner(mut args:Vec<String>)->Res<Value>{
 let mut dir=None;
 if args.first().is_some_and(|x|x=="--data-dir"){if args.len()<3{return Err("missing data-dir or command".into())}dir=Some(PathBuf::from(&args[1]));args.drain(..2);}
 let cmd=args.first().map(String::as_str).unwrap_or("help");
 if ["help","--help","-h"].contains(&cmd){return Ok(json!({"help":HELP}))}
 let base=match dir{Some(d)=>d,None=>{if !cfg!(target_os="macos"){return Err("default CLI data location currently supported on macOS only".into())}PathBuf::from(std::env::var_os("HOME").ok_or("HOME not set")?).join("Library/Application Support/com.weepwood.todo")}};
 let path=base.join("todo.sqlite3");
 if !path.is_file(){return Err("TODO local database not found; start the updated app first".into())}
 let writable=matches!(cmd,"bind"|"unbind"|"add"|"batch");
 let mut c=Connection::open_with_flags(&path,if writable{OpenFlags::SQLITE_OPEN_READ_WRITE}else{OpenFlags::SQLITE_OPEN_READ_ONLY}).map_err(|_|"cannot open TODO database")?;
 c.busy_timeout(Duration::from_secs(5)).map_err(|e|e.to_string())?;
 c.execute_batch("PRAGMA foreign_keys=ON").map_err(|e|e.to_string())?;
 let ready:bool=c.query_row("SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='cli_capture_meta') AND EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='cli_binding')",[],|r|r.get(0)).map_err(|e|e.to_string())?;
 if !ready{return Err("local CLI requires the updated TODO app; no database changes made".into())}
 if cmd=="doctor"&&args.len()==1{return Ok(json!({"ready":true,"bound":bound_scope(&c)?.is_some(),"scope_kind":bound_scope(&c)?.map(|s|if s=="guest"{"guest"}else{"account"}),"sync_status":"not_checked"}))}
 if cmd=="bind"{
  let opts=parse_opts(&args[1..],&["--scope"])?;let scope=opts.get("--scope").ok_or("explicit scope required")?;
  bind(&c,scope)?;return Ok(json!({"bound":true,"scope_kind":if scope=="guest"{"guest"}else{"account"}}))
 }
 if cmd=="unbind"&&args.len()==1{c.execute("DELETE FROM cli_binding WHERE slot=1",[]).map_err(|e|e.to_string())?;return Ok(json!({"bound":false}))}
 let scope=bound_scope(&c)?.ok_or("no bound workspace; use TODO Settings or explicit bind --scope")?;
 match cmd{
  "lists" if args.len()==1=>Ok(json!({"lists":lists(&c,&scope)?})),
  "status" if args.len()==2=>receipt(&c,&scope,&request_id(args.get(1))?),
  "add"|"batch"=>{
   let (rows,opts)=if cmd=="add"{
    let title=args.get(1).ok_or("title required")?;if title.starts_with("--"){return Err("title required".into())}
    let opts=parse_opts(&args[2..],&["--date","--time","--list","--list-id","--priority","--duration","--notes","--deadline","--reminder-at","--request-id","--wait"])?;
    (add_row(&c,&scope,title,&opts)?,opts)
   }else{
    let opts=parse_opts(&args[1..],&["--file","--request-id","--wait"])?;let file=opts.get("--file").ok_or("--file required")?;
    let mut raw=Vec::new();if file=="-"{io::stdin().take(262145).read_to_end(&mut raw)}else{std::fs::File::open(file).map_err(|_|"cannot open input file")?.take(262145).read_to_end(&mut raw)}.map_err(|_|"cannot read batch")?;
    if raw.len()>262144{return Err("payload exceeds 256 KiB".into())}
    (serde_json::from_slice(&raw).map_err(|_|"invalid JSON batch")?,opts)
   };
   let id=request_id(opts.get("--request-id"))?;
   let wait=opts.get("--wait").map(|v|v.parse::<u64>().ok().filter(|x|*x<=60).ok_or("wait must be 0–60 seconds")).transpose()?.unwrap_or(5);
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
 #[test]fn strict_batch_validation(){
  for bad in [json!([{"title":"x","date":"2026-02-30"}]),json!([{"title":"x","date":"2026-1-001"}]),json!([{"title":"x","time":"10:00"}]),json!([{"title":"x","status":"done"}]),json!([{"title":"x","reminderAt":"2026-11-26T25:00"}])]{assert!(normalized(bad).is_err())}
  assert_eq!(normalized(json!([{"title":" a ","priority":0}])).unwrap(),json!([{"title":"a","priority":0}]));
 }
}
