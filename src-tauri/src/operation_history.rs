// Local, bounded, commit-level journal. The workspace remains authoritative.
use super::*;
use serde_json::{json,Value};
use sha2::{Digest,Sha256};
use std::collections::{BTreeMap,BTreeSet};
const SAFE:&[&str]=&["title","priority","listId","sectionId","tags","date","time","anchor","duration","deadline","planMinutes","planSegments","deletedAt"];
const DAYS:i64=30*86400;
pub(super) fn fingerprint(v:&Value)->String{format!("{:x}",Sha256::digest(v.to_string().as_bytes()))}
fn task_map(v:&Value)->BTreeMap<&str,&Value>{
 v["tasks"].as_array().into_iter().flatten().filter_map(|t|Some((t["id"].as_str()?,t))).collect()
}
fn field(t:&Value,k:&str)->Value{match t.get(k){Some(v)=>json!({"present":true,"value":v}),None=>json!({"present":false})}}
// Keep only field names as evidence of activity not represented by a net
// snapshot diff. A remote ABA edit or an evicted/changed event is not "no edit".
fn activity_evidence(a:&Value,b:&Value,changed:&BTreeSet<&str>)->(BTreeSet<String>,bool){
 if a.get("activity")==b.get("activity"){return (BTreeSet::new(),false)}
 fn events(v:&Value)->Option<BTreeMap<&str,&Value>>{
  let mut out=BTreeMap::new();
  if let Some(raw)=v.get("activity"){
   for e in raw.as_array()?{if out.insert(e["id"].as_str()?,e).is_some(){return None}}
  }
  Some(out)
 }
 let (Some(old),Some(new))=(events(a),events(b))else{return (BTreeSet::new(),true)};
 let mut uncertain=old.keys().any(|id|!new.contains_key(id));
 let mut counts:BTreeMap<String,usize>=BTreeMap::new();
 let mut trash_events=0;
 let expected_trash=if b["deletedAt"].is_null(){"restored"}else{"deleted"};
 let trash_ops:Vec<&str>=new.iter().filter(|(id,e)|!old.contains_key(*id)&&e["category"]=="lifecycle"&&e["kind"]==expected_trash&&changed.contains("deletedAt")).filter_map(|(_,e)|e["operation"].as_str()).collect();
 for (id,event) in &new{
  if old.get(id)==Some(event){continue}
  if old.contains_key(id){uncertain=true;}
  match event["category"].as_str(){
   Some("lifecycle")=>{
    // A single matching trash transition is the normal evidence generated
    // by a compensation; additional transitions or mismatched events are not.
    let expected=if b["deletedAt"].is_null(){"restored"}else{"deleted"};
    if changed.contains("deletedAt")&&event["kind"].as_str()==Some(expected){trash_events+=1;if trash_events>1{uncertain=true}}
    else{uncertain=true}
   },
   Some("relation")=>{
    // The shared editor emits a children-count activity for a parent when
    // its children are trashed/restored in the very same operation.
    if !(event["kind"]=="children"&&trash_ops.len()==1&&event["operation"].as_str()==Some(trash_ops[0])&&event["changes"].as_array().is_some_and(|f|f.len()==1&&f[0]["field"]=="children")){uncertain=true}
   },
   Some("focus")=>uncertain=true,
   _=>{}
  }
  let Some(fields)=event["changes"].as_array()else{uncertain=true;continue};
  for f in fields{
   let Some(k)=f["field"].as_str()else{uncertain=true;continue};
   if SAFE.contains(&k){*counts.entry(k.to_owned()).or_default()+=1}
   else if matches!(k,"repeat"|"interval"|"weekdays"|"repeatUntil"|"repeatCount"|"seriesHold"|"planLocked"|"stage"|"reminderAt"|"extraReminders"|"points"){uncertain=true}
  }
 }
 (counts.into_iter().filter(|(k,n)|*n>1||!changed.contains(k.as_str())).map(|(k,_)|k).collect(),uncertain)
}
// Exact ordinary completion/reopen only. A compact proof excludes activity
// but includes every other field, including points and reminder configuration.
fn lifecycle_proof(a:&Value,b:&Value,changed:&BTreeSet<&str>)->Option<Value>{
 let keys=["status","stage","completedAt"];
 if changed!=&BTreeSet::from(keys){return None}
 let ordinary=|t:&Value|t["repeat"]=="none"&&t["seriesId"].is_null()&&t["previousId"].is_null()&&t["seriesHold"].is_null()&&t["deletedAt"].is_null()&&t["planLocked"]!=true;
 if !ordinary(a)||!ordinary(b){return None}
 let pending=|t:&Value|t["status"]=="pending"&&t["stage"]=="todo"&&t["completedAt"].is_null();
 let completed=|t:&Value|t["status"]=="completed"&&t["stage"]=="done"&&t["completedAt"].as_str().is_some();
 let kind=if pending(a)&&completed(b){"completed"}else if completed(a)&&pending(b){"reopened"}else{return None};
 let old=a["activity"].as_array();let new=b["activity"].as_array()?;
 if old.is_some_and(|old|old.iter().any(|e|!new.contains(e))){return None}
 let added:Vec<_>=new.iter().filter(|e|!old.is_some_and(|old|old.contains(e))).collect();
 if added.len()!=1||added[0]["category"]!="lifecycle"||added[0]["kind"]!=kind{return None}
 let mut business=b.clone();business.as_object_mut()?.remove("activity");
 Some(json!({"afterHash":fingerprint(&business),"fields":keys.iter().map(|k|(k.to_string(),json!({"before":field(a,k),"after":field(b,k)}))).collect::<serde_json::Map<String,Value>>() }))
}
pub(super) fn history_schema(c:&Connection)->rusqlite::Result<()>{
 c.execute_batch("CREATE TABLE IF NOT EXISTS operation_history_head(scope TEXT PRIMARY KEY, version INTEGER NOT NULL, fingerprint TEXT NOT NULL); CREATE TABLE IF NOT EXISTS operation_history(scope TEXT NOT NULL, version INTEGER NOT NULL, at INTEGER NOT NULL, source TEXT NOT NULL, kind TEXT NOT NULL, request_id TEXT, group_id TEXT, body TEXT NOT NULL, PRIMARY KEY(scope,version)); CREATE INDEX IF NOT EXISTS operation_history_age ON operation_history(scope,at); CREATE TABLE IF NOT EXISTS operation_history_raw_proof(scope TEXT PRIMARY KEY, version INTEGER NOT NULL, fingerprint TEXT NOT NULL, raw_hash TEXT NOT NULL);")
}
fn raw_fingerprint(raw:&str)->String{format!("{:x}",Sha256::digest(raw.as_bytes()))}
// A raw proof is a cache, never an independent authority. Bind it to the
// canonical head AND exact snapshot bytes. Older writers safely miss it.
fn raw_proof_matches(c:&Connection,scope:&str,head:&(i64,String),raw_hash:&str)->Result<bool,String>{
 c.query_row("SELECT EXISTS(SELECT 1 FROM operation_history_raw_proof WHERE scope=?1 AND version=?2 AND fingerprint=?3 AND raw_hash=?4)",params![scope,head.0,&head.1,raw_hash],|r|r.get(0)).map_err(|e|e.to_string())
}
#[cfg(test)]
fn append_history(c:&Connection,scope:&str,prior:Option<&Value>,next:&Value,now:i64,request:Option<(&str,&str,&str,Option<&Value>)>)->Result<(),String>{
 append_history_with_raw(c,scope,prior,next,now,request,None)
}
pub(super) fn append_history_with_raw(c:&Connection,scope:&str,prior:Option<&Value>,next:&Value,now:i64,request:Option<(&str,&str,&str,Option<&Value>)>,raw:Option<(&str,&str)>)->Result<(),String>{
 let prior=match prior{Some(v)=>v,None=>return Ok(())};
 if prior==next{return Ok(())}
 let head:Option<(i64,String)>=c.query_row("SELECT version,fingerprint FROM operation_history_head WHERE scope=?1",[scope],|r|Ok((r.get(0)?,r.get(1)?))).optional().map_err(|e|e.to_string())?;
 let mut version=head.as_ref().map(|x|x.0).unwrap_or(0);
 let gap=if let Some(h)=&head{
  let cached=if let Some((before,_))=raw{raw_proof_matches(c,scope,h,&raw_fingerprint(before))?}else{false};
  !cached&&fingerprint(prior)!=h.1
 }else{false};
 if gap{
  version+=1;
  c.execute("INSERT INTO operation_history VALUES(?1,?2,?3,'local','gap',NULL,NULL,?4)",params![scope,version,now,json!({"gap":true,"rows":[]}).to_string()]).map_err(|e|e.to_string())?;
 }
 let old=task_map(prior);let new=task_map(next);
 let rows=history_rows(old.keys().chain(new.keys()).collect::<BTreeSet<_>>().into_iter().map(|id|(*id,old.get(id).copied(),new.get(id).copied())));
 let other:Vec<_>=prior.as_object().into_iter().flatten().map(|(k,_)|k).chain(next.as_object().into_iter().flatten().map(|(k,_)|k)).collect::<BTreeSet<_>>().into_iter().filter(|k|*k!="tasks"&&prior.get(*k)!=next.get(*k)).collect();
 write_history_rows(c,scope,version,rows,other,now,request,fingerprint(next),raw.map(|(_,after)|after))
}
// Shared field/lifecycle/activity evidence. The full writer supplies all
// task pairs; the isolated row writer supplies its validated touched pairs.
pub(super) fn history_rows<'a>(changes:impl IntoIterator<Item=(&'a str,Option<&'a Value>,Option<&'a Value>)>)->Vec<Value>{
 let mut rows=vec![];
 for (id,a,b) in changes{
  match (a,b){
   (None,Some(t))=>rows.push(json!({"id":id,"created":true,"afterHash":fingerprint(t)})),
   (Some(_),None)=>rows.push(json!({"id":id,"removed":true})),
   (Some(a),Some(b))=>{
    if a==b{continue}
    let (Some(am),Some(bm))=(a.as_object(),b.as_object())else{continue};
    let changed:Vec<_>=am.keys().chain(bm.keys()).collect::<BTreeSet<_>>().into_iter().filter(|k|*k!="activity"&&a.get(*k)!=b.get(*k)).collect();
    let changed_names:BTreeSet<&str>=changed.iter().map(|k|k.as_str()).collect();
    let (evidence,uncertain)=activity_evidence(a,b,&changed_names);
    let lifecycle=lifecycle_proof(a,b,&changed_names);
    if changed.is_empty()&&evidence.is_empty()&&!uncertain{continue}
    let mut fields=serde_json::Map::new();let mut protected=vec![];
    for k in changed{if SAFE.contains(&k.as_str()){fields.insert(k.clone(),json!({"before":field(a,k),"after":field(b,k)}));}else{protected.push(k)}}
    let mut row=json!({"id":id,"fields":fields,"protected":protected,"activityEvidence":evidence,"activityUncertain":uncertain});
    if let Some(proof)=lifecycle{row["lifecycle"]=proof;}
    rows.push(row);
   },_=>{}
  }
 }
 rows
}
pub(super) fn write_history_rows(c:&Connection,scope:&str,mut version:i64,mut rows:Vec<Value>,other:Vec<&String>,now:i64,request:Option<(&str,&str,&str,Option<&Value>)>,hash:String,raw_after:Option<&str>)->Result<(),String>{
 // Never store full workspace, note bodies, links, checklists, or execution records.
 if let Some((id,"batch-capture",_,_))=request{for row in &mut rows{if row["created"]!=true||!row["id"].as_str().is_some_and(|x|x.starts_with(&format!("{id}:"))){row["unattributed"]=json!(true)}}}
 // Activity evidence without a net business change also creates a version.
 if !rows.is_empty()||!other.is_empty(){
  version+=1;
  let (source,kind,rid,group)=match request{Some((id,kind,group,_))=>("cli",kind,Some(id),Some(group)),None=>("local","workspace-save",None,None)};
  let mut body=json!({"rows":rows,"protectedWorkspace":other});
  if let Some((_,_,_,Some(approval)))=request{body["confirmation"]=approval.clone();}
  let mut encoded=body.to_string();if encoded.len()>262144{encoded=json!({"gap":true,"rows":[],"reason":"commit exceeds history body limit"}).to_string()}
  c.execute("INSERT INTO operation_history VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",params![scope,version,now,source,kind,rid,group,encoded]).map_err(|e|e.to_string())?;
 }

 c.execute("INSERT INTO operation_history_head VALUES(?1,?2,?3) ON CONFLICT(scope) DO UPDATE SET version=excluded.version,fingerprint=excluded.fingerprint",params![scope,version,&hash]).map_err(|e|e.to_string())?;
 if let Some(after)=raw_after{
  c.execute("INSERT INTO operation_history_raw_proof VALUES(?1,?2,?3,?4) ON CONFLICT(scope) DO UPDATE SET version=excluded.version,fingerprint=excluded.fingerprint,raw_hash=excluded.raw_hash",params![scope,version,&hash,raw_fingerprint(after)]).map_err(|e|e.to_string())?;
 }
 c.execute("DELETE FROM operation_history WHERE scope=?1 AND (at<?2 OR version<=?3)",params![scope,now-DAYS,version-300]).map_err(|e|e.to_string())?;
 // Also bound aggregate retained values to 16 MiB per scope.
 c.execute("DELETE FROM operation_history WHERE scope=?1 AND version IN (SELECT version FROM (SELECT version,SUM(length(CAST(body AS BLOB))) OVER (ORDER BY version DESC) AS total FROM operation_history WHERE scope=?1) WHERE total>16777216)",[scope]).map_err(|e|e.to_string())?;
 Ok(())
}
pub(super) fn history_read(c:&Connection,scope:&str,detail:bool,limit:i64)->Result<Value,String>{
 history_read_selected(c,scope,detail,limit,None)
}
pub(super) fn history_read_version(c:&Connection,scope:&str,version:i64)->Result<Value,String>{
 if version<=0{return Err("invalid history version".into())}
 history_read_selected(c,scope,true,1,Some(version))
}
fn history_read_selected(c:&Connection,scope:&str,detail:bool,limit:i64,version:Option<i64>)->Result<Value,String>{
 // Keep head, snapshot and entries in one SQLite read transaction.
 let tx=c.unchecked_transaction().map_err(|e|e.to_string())?;
 let result=history_read_snapshot(&tx,scope,detail,limit,version)?;
 tx.commit().map_err(|e|e.to_string())?;
 Ok(result)
}
fn history_read_snapshot(c:&Connection,scope:&str,detail:bool,limit:i64,version:Option<i64>)->Result<Value,String>{
 let now=Local::now().timestamp();
 let head:Option<(i64,String)>=c.query_row("SELECT version,fingerprint FROM operation_history_head WHERE scope=?1",[scope],|r|Ok((r.get(0)?,r.get(1)?))).optional().map_err(|e|e.to_string())?;
 let current:Option<String>=c.query_row("SELECT body FROM snapshots WHERE scope=?1",[scope],|r|r.get(0)).optional().map_err(|e|e.to_string())?;
 read_history_body(c,scope,detail,limit,version,now,head,current)
}
#[cfg(any(test,feature="research-r4"))]
pub(super) fn read_row_history(c:&Connection,scope:&str,body:String)->Result<Value,String>{
 let head=c.query_row("SELECT version,fingerprint FROM operation_history_head WHERE scope=?1",[scope],|r|Ok((r.get(0)?,r.get(1)?))).optional().map_err(|e|e.to_string())?;
 read_history_body(c,scope,true,300,None,Local::now().timestamp(),head,Some(body))
}
fn read_history_body(c:&Connection,scope:&str,detail:bool,limit:i64,version:Option<i64>,now:i64,head:Option<(i64,String)>,current:Option<String>)->Result<Value,String>{
 let raw_hash=current.as_deref().map(raw_fingerprint);
 let intact=match (&head,&current,&raw_hash){
  (None,_,_)=>true,
  (Some(h),Some(raw),Some(hash))=>raw_proof_matches(c,scope,h,hash)?||serde_json::from_str::<Value>(raw).ok().is_some_and(|v|fingerprint(&v)==h.1),
  _=>false
 };
 let mut q=c.prepare("SELECT version,at,source,kind,request_id,group_id,CASE WHEN ?4 THEN body ELSE NULL END,CASE WHEN json_type(body,'$.rows')='array' THEN json_array_length(body,'$.rows') ELSE 0 END,COALESCE(json_type(body,'$.gap')='true',0) FROM operation_history WHERE scope=?1 AND at>=?2 AND (?5 IS NULL OR version=?5) ORDER BY version DESC LIMIT ?3").map_err(|e|e.to_string())?;
 let mut rows=q.query(params![scope,now-DAYS,limit.clamp(1,300),detail,version]).map_err(|e|e.to_string())?;
 let mut out=vec![];let mut bytes=0;
 while let Some(r)=rows.next().map_err(|e|e.to_string())?{
  let raw:Option<String>=r.get(6).map_err(|e|e.to_string())?;
  let body:Value=match raw{Some(raw)=>serde_json::from_str(&raw).map_err(|e|e.to_string())?,None=>Value::Null};
  let row=json!({"version":r.get::<_,i64>(0).map_err(|e|e.to_string())?,"at":r.get::<_,i64>(1).map_err(|e|e.to_string())?,"source":r.get::<_,String>(2).map_err(|e|e.to_string())?,"kind":r.get::<_,String>(3).map_err(|e|e.to_string())?,"requestId":r.get::<_,Option<String>>(4).map_err(|e|e.to_string())?,"groupId":r.get::<_,Option<String>>(5).map_err(|e|e.to_string())?,"count":r.get::<_,i64>(7).map_err(|e|e.to_string())?,"gap":r.get::<_,bool>(8).map_err(|e|e.to_string())?,"body":body});
  bytes+=row.to_string().len();if bytes>400000{break}out.push(row);
 }
 Ok(json!({"head":head.map(|h|h.0).unwrap_or(0),"intact":intact,"entries":out,"retentionDays":30,"workspaceFingerprint":raw_hash}))
}

#[cfg(test)]
mod tests{
 use super::*;
 fn snapshot(priority:i32)->Value{json!({"version":2,"tasks":[{"id":"qa","title":"task","priority":priority,"notes":"secret body","activity":[]}],"sessions":[]})}
 #[test]fn activity_only_aba_and_eviction_create_evidence_versions(){
  let mut c=Connection::open_in_memory().unwrap();super::super::schema(&c).unwrap();
  let a=snapshot(3);super::super::save(&mut c,"guest",&a.to_string()).unwrap();
  let mut b=a.clone();
  b["tasks"][0]["activity"]=json!([{"id":"remote1","category":"property","changes":[{"field":"priority","before":"private A","after":"private B"}]},{"id":"remote2","category":"property","changes":[{"field":"priority","before":"private B","after":"private A"}]}]);
  super::super::save(&mut c,"guest",&b.to_string()).unwrap();
  let h=history_read(&c,"guest",true,300).unwrap();assert_eq!(h["head"],1);
  assert_eq!(h["entries"][0]["body"]["rows"][0]["activityEvidence"],json!(["priority"]));
  assert_eq!(h["entries"][0]["body"]["rows"][0]["activityUncertain"],false);
  assert!(!h.to_string().contains("private A"));
  super::super::save(&mut c,"guest",&a.to_string()).unwrap();
  let h=history_read(&c,"guest",true,300).unwrap();assert_eq!(h["head"],2);
  assert_eq!(h["entries"][0]["body"]["rows"][0]["activityUncertain"],true);
 }
 #[test]fn normal_trash_transition_does_not_poison_redo(){
  let mut a=snapshot(3);a["tasks"][0]["deletedAt"]=Value::Null;
  let mut b=a.clone();b["tasks"][0]["deletedAt"]=json!("2026-11-26T10:00:00Z");
  b["tasks"][0]["activity"]=json!([{"id":"undo:deleted","operation":"undo","category":"lifecycle","kind":"deleted","changes":[]},{"id":"undo:children","operation":"undo","category":"relation","kind":"children","changes":[{"field":"children"}]}]);
  let changed=BTreeSet::from(["deletedAt"]);
  assert_eq!(activity_evidence(&a["tasks"][0],&b["tasks"][0],&changed),(BTreeSet::new(),false));
  let mut c=b.clone();c["tasks"][0]["deletedAt"]=Value::Null;
  c["tasks"][0]["activity"].as_array_mut().unwrap().push(json!({"id":"redo:restored","operation":"redo","category":"lifecycle","kind":"restored","changes":[]}));
  assert_eq!(activity_evidence(&b["tasks"][0],&c["tasks"][0],&changed),(BTreeSet::new(),false));
  assert!(activity_evidence(&a["tasks"][0],&c["tasks"][0],&BTreeSet::new()).1);
 }
 #[test]fn lifecycle_proof_only_exact_ordinary_transition(){
  let mut a=snapshot(3);a["tasks"][0]=json!({"id":"qa","title":"task","repeat":"none","status":"pending","stage":"todo","completedAt":null,"points":5,"activity":[]});
  let mut b=a.clone();let t=&mut b["tasks"][0];t["status"]=json!("completed");t["stage"]=json!("done");t["completedAt"]=json!("2026-11-26T08:00:00Z");t["activity"]=json!([{"id":"complete","category":"lifecycle","kind":"completed","changes":[]}]);
  let keys=BTreeSet::from(["status","stage","completedAt"]);
  assert!(lifecycle_proof(&a["tasks"][0],&b["tasks"][0],&keys).is_some());
  let mut repeated=b.clone();repeated["tasks"][0]["repeat"]=json!("daily");
  assert!(lifecycle_proof(&a["tasks"][0],&repeated["tasks"][0],&keys).is_none());
  let mut extra=b.clone();extra["tasks"][0]["activity"].as_array_mut().unwrap().push(json!({"id":"remote","category":"property","kind":"priority"}));
  assert!(lifecycle_proof(&a["tasks"][0],&extra["tasks"][0],&keys).is_none());
 }
 #[test]fn retained_versions_and_read_budget(){
  let c=Connection::open_in_memory().unwrap();super::super::schema(&c).unwrap();
  let base=snapshot(0);let mut a=base.clone();
  let now=Local::now().timestamp();
  for i in 1..=305{let mut b=a.clone();b["tasks"][0]["priority"]=json!(i);append_history(&c,"guest",Some(&a),&b,now,None).unwrap();a=b;}
  let (count,min,max):(i64,i64,i64)=c.query_row("SELECT count(*),min(version),max(version) FROM operation_history WHERE scope='guest'",[],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).unwrap();
  assert_eq!((count,min,max),(300,6,305));
  c.execute("UPDATE operation_history SET body=?1 WHERE scope='guest'",[json!({"rows":[],"padding":"x".repeat(100000)}).to_string()]).unwrap();
  let mut b=a.clone();b["tasks"][0]["priority"]=json!(306);append_history(&c,"guest",Some(&a),&b,now,None).unwrap();
  let size:i64=c.query_row("SELECT SUM(length(CAST(body AS BLOB))) FROM operation_history WHERE scope='guest'",[],|r|r.get(0)).unwrap();assert!(size<=16777216);
  let read=history_read(&c,"guest",true,300).unwrap();assert!(read["entries"].as_array().unwrap().len()<10);
  assert_eq!(read["head"],306);
  // A single detail read can retrieve an older retained version without
  // loading newer bodies. Recovery still uses the bounded continuous log.
  let target:i64=c.query_row("SELECT min(version) FROM operation_history WHERE scope='guest'",[],|r|r.get(0)).unwrap();
  let one=history_read_version(&c,"guest",target).unwrap();
  assert_eq!(one["entries"].as_array().unwrap().len(),1);assert_eq!(one["entries"][0]["version"],target);
  assert!(history_read_version(&c,"00000000-0000-4000-8000-000000000001",target).unwrap()["entries"].as_array().unwrap().is_empty());
  c.execute("UPDATE operation_history SET at=?1 WHERE version=?2",[now-DAYS-1,target]).unwrap();
  assert!(history_read_version(&c,"guest",target).unwrap()["entries"].as_array().unwrap().is_empty());
 }
 #[test]#[ignore]fn history_save_benchmark(){
  use std::time::Instant;
  let mut c=Connection::open_in_memory().unwrap();super::super::schema(&c).unwrap();
  let mut a=json!({"version":2,"tasks":(0..1000).map(|i|json!({"id":format!("qa-{i}"),"title":format!("synthetic task {i}"),"notes":"","priority":0,"activity":[]})).collect::<Vec<_>>()});
  super::super::save(&mut c,"guest",&a.to_string()).unwrap();
  let mut ms=vec![];
  for i in 0..305{a["tasks"][i%1000]["priority"]=json!(3);let start=Instant::now();super::super::save(&mut c,"guest",&a.to_string()).unwrap();ms.push(start.elapsed().as_secs_f64()*1000.0);}
  ms.sort_by(|a,b|a.total_cmp(b));let start=Instant::now();let h=history_read(&c,"guest",true,300).unwrap();let read=start.elapsed().as_secs_f64()*1000.0;
  let bytes:i64=c.query_row("SELECT sum(length(CAST(body AS BLOB))) FROM operation_history WHERE scope='guest'",[],|r|r.get(0)).unwrap();
  assert_eq!(h["head"],305);assert_eq!(h["entries"].as_array().unwrap().len(),300);
  println!("history_benchmark tasks=1000 saves=305 retained=300 p50_ms={:.3} p95_ms={:.3} max_ms={:.3} read_ms={:.3} body_bytes={bytes}",ms[152],ms[289],ms[304],read);
 }
 #[test]#[ignore]fn history_file_benchmark_10000(){
  use std::time::Instant;
  let dir=std::env::temp_dir().join(format!("todo-history-bench-{}",uuid::Uuid::new_v4()));std::fs::create_dir(&dir).unwrap();
  let path=dir.join("bench.sqlite3");let mut c=Connection::open(&path).unwrap();super::super::schema(&c).unwrap();
  let mut a=json!({"version":2,"tasks":(0..10000).map(|i|json!({"id":format!("qa-{i}"),"title":format!("synthetic task {i}"),"notes":"synthetic","priority":0,"activity":(0..if i<1000{20}else{3}).map(|j|json!({"id":format!("qa-{i}-{j}"),"kind":"priority","category":"property","operation":format!("op-{j}"),"changes":[{"field":"priority","before":"0","after":"1"}]})).collect::<Vec<_>>() })).collect::<Vec<_>>()});
  let raw=a.to_string();assert!(raw.len()<16_000_000);
  let bytes=raw.len();super::super::save(&mut c,"guest",&raw).unwrap();let mut ms=vec![];
  for i in 0..24{
   let t=&mut a["tasks"][i];t["priority"]=json!(3);
   t["activity"].as_array_mut().unwrap().push(json!({"id":format!("new-{i}"),"kind":"priority","category":"property","changes":[{"field":"priority","before":"0","after":"3"}]}));
   let raw=a.to_string();let start=Instant::now();super::super::save(&mut c,"guest",&raw).unwrap();ms.push(start.elapsed().as_secs_f64()*1000.0);
  }
  ms.sort_by(|a,b|a.total_cmp(b));let start=Instant::now();let h=history_read(&c,"guest",true,300).unwrap();let read=start.elapsed().as_secs_f64()*1000.0;
  assert_eq!(h["head"],24);assert_eq!(c.query_row("PRAGMA integrity_check",[],|r|r.get::<_,String>(0)).unwrap(),"ok");
  let db=std::fs::metadata(&path).unwrap().len();let wal=std::fs::metadata(dir.join("bench.sqlite3-wal")).map(|m|m.len()).unwrap_or(0);
  println!("file_benchmark tasks=10000 activity_events=47000 saves=24 initial_snapshot_bytes={bytes} p50_ms={:.3} p95_ms={:.3} max_ms={:.3} read_ms={:.3} db_bytes={db} wal_bytes={wal}",(ms[11]+ms[12])/2.0,ms[22],ms[23],read);
  drop(c);std::fs::remove_dir_all(dir).unwrap();
 }
 #[test]#[ignore]fn history_release_matrix(){
  use std::time::Instant;
  fn stat(v:&mut Vec<f64>)->String{v.sort_by(|a,b|a.total_cmp(b));let n=v.len();format!("{:.3}/{:.3}/{:.3}",v[n/2],v[((n as f64*0.95).ceil() as usize)-1],v[n-1])}
  for count in [1000,5000,10000]{for density in [1,5]{
   let dir=std::env::temp_dir().join(format!("todo-perf-{}",uuid::Uuid::new_v4()));std::fs::create_dir(&dir).unwrap();let path=dir.join("bench.sqlite3");
   let mut c=Connection::open(&path).unwrap();super::super::schema(&c).unwrap();
   let mut a=json!({"version":2,"tasks":(0..count).map(|i|json!({"id":format!("qa-{i}"),"title":format!("synthetic task {i}"),"notes":"synthetic","priority":0,"activity":(0..density).map(|j|json!({"id":format!("qa-{i}-{j}"),"kind":"priority","category":"property","operation":format!("op-{j}"),"changes":[{"field":"priority","before":"0","after":"1"}]})).collect::<Vec<_>>() })).collect::<Vec<_>>()});
   let raw=a.to_string();let size=raw.len();assert!(size<16_000_000);super::super::save(&mut c,"guest",&raw).unwrap();
   let mut saves=vec![];let mut parse=vec![];let mut hash=vec![];let mut summary=vec![];let mut detail=vec![];let mut noop=vec![];
   for i in 0..12{
    a["tasks"][i]["priority"]=json!(3);
    let raw=a.to_string();
    let t=Instant::now();let parsed:Value=serde_json::from_str(&raw).unwrap();parse.push(t.elapsed().as_secs_f64()*1000.);
    let t=Instant::now();std::hint::black_box(fingerprint(&parsed));hash.push(t.elapsed().as_secs_f64()*1000.);
    let t=Instant::now();super::super::save(&mut c,"guest",&raw).unwrap();saves.push(t.elapsed().as_secs_f64()*1000.);
    let t=Instant::now();let h=history_read(&c,"guest",false,300).unwrap();summary.push(t.elapsed().as_secs_f64()*1000.);assert!(h["intact"]==true);
    let t=Instant::now();let h=history_read(&c,"guest",true,300).unwrap();detail.push(t.elapsed().as_secs_f64()*1000.);assert_eq!(h["head"],i+1);
    let t=Instant::now();super::super::save(&mut c,"guest",&raw).unwrap();noop.push(t.elapsed().as_secs_f64()*1000.);
   }
   assert_eq!(c.query_row("PRAGMA integrity_check",[],|r|r.get::<_,String>(0)).unwrap(),"ok");
   println!("matrix tasks={count} density={density} samples=12 bytes={size} save={} parse={} canonical_hash={} summary={} detail={} noop={} db={} wal={}",stat(&mut saves),stat(&mut parse),stat(&mut hash),stat(&mut summary),stat(&mut detail),stat(&mut noop),std::fs::metadata(&path).unwrap().len(),std::fs::metadata(dir.join("bench.sqlite3-wal")).map(|m|m.len()).unwrap_or(0));
   drop(c);std::fs::remove_dir_all(dir).unwrap();
  }}
 }
 #[test]fn raw_proof_falls_back_for_old_writes_and_preserves_gap_detection(){
  let mut c=Connection::open_in_memory().unwrap();super::super::schema(&c).unwrap();
  let a=snapshot(0);let b=snapshot(3);
  super::super::save(&mut c,"guest",&a.to_string()).unwrap();super::super::save(&mut c,"guest",&b.to_string()).unwrap();
  let head:(i64,String)=c.query_row("SELECT version,fingerprint FROM operation_history_head WHERE scope='guest'",[],|r|Ok((r.get(0)?,r.get(1)?))).unwrap();
  assert!(raw_proof_matches(&c,"guest",&head,&raw_fingerprint(&b.to_string())).unwrap());
  let summary=history_read(&c,"guest",false,300).unwrap();let detail=history_read(&c,"guest",true,300).unwrap();
  assert_eq!(summary["entries"][0]["count"],detail["entries"][0]["count"]);assert_eq!(summary["entries"][0]["gap"],detail["entries"][0]["gap"]);assert!(summary["entries"][0]["body"].is_null());
  // An old writer may serialize differently while preserving the canonical state.
  let pretty=serde_json::to_string_pretty(&b).unwrap();
  c.execute("UPDATE snapshots SET body=?1 WHERE scope='guest'",[&pretty]).unwrap();
  assert!(history_read(&c,"guest",true,300).unwrap()["intact"]==true);
  // Changed bytes and business state must not inherit the cached proof.
  c.execute("UPDATE snapshots SET body=?1 WHERE scope='guest'",[a.to_string()]).unwrap();
  assert!(history_read(&c,"guest",true,300).unwrap()["intact"]==false);
  super::super::save(&mut c,"guest",&snapshot(2).to_string()).unwrap();
  let h=history_read(&c,"guest",true,300).unwrap();assert_eq!(h["head"],3);assert_eq!(h["entries"][1]["gap"],true);assert_eq!(h["intact"],true);
  // Legacy v4 without cached proof still works.
  c.execute("DELETE FROM operation_history_raw_proof",[]).unwrap();
  assert!(history_read(&c,"guest",true,300).unwrap()["intact"]==true);
 }
 #[test]fn unchanged_workspace_store_is_not_rewritten(){
  let mut c=Connection::open_in_memory().unwrap();super::super::schema(&c).unwrap();
  let body=snapshot(0).to_string();let store=json!({"todo-workbench-v1":body}).to_string();
  super::super::persist_store(&mut c,"guest",&store).unwrap();
  c.execute_batch("CREATE TRIGGER qa_no_duplicate_store BEFORE UPDATE ON workspace_store BEGIN SELECT RAISE(ABORT,'unexpected store write'); END;").unwrap();
  super::super::persist_store(&mut c,"guest",&store).unwrap();
  let changed=json!({"todo-workbench-v1":body,"todo-cloud-meta":"synthetic"}).to_string();
  assert!(super::super::persist_store(&mut c,"guest",&changed).is_err());
  assert_eq!(c.query_row("SELECT body FROM workspace_store WHERE scope='guest'",[],|r|r.get::<_,String>(0)).unwrap(),store);
 }
 #[test]#[ignore]fn native_store_write_amplification(){
  use std::time::Instant;
  let dir=std::env::temp_dir().join(format!("todo-store-perf-{}",uuid::Uuid::new_v4()));std::fs::create_dir(&dir).unwrap();
  let path=dir.join("native.sqlite3");let mut c=Connection::open(&path).unwrap();super::super::schema(&c).unwrap();
  // Isolated measurement only: disable auto-checkpoint to measure WAL frames.
  c.execute_batch("PRAGMA wal_autocheckpoint=0").unwrap();
  let mut a=json!({"version":2,"tasks":(0..10000).map(|i|json!({"id":format!("qa-{i}"),"title":format!("synthetic task {i}"),"notes":"synthetic","priority":0,"activity":(0..5).map(|j|json!({"id":format!("qa-{i}-{j}"),"kind":"priority","category":"property","operation":format!("op-{j}"),"changes":[{"field":"priority","before":"0","after":"1"}]})).collect::<Vec<_>>() })).collect::<Vec<_>>()});
  let mut store=json!({"todo-workbench-v1":a.to_string(),"todo-cloud-meta":"synthetic"}).to_string();
  super::super::persist_store(&mut c,"guest",&store).unwrap();
  let wal=||std::fs::metadata(dir.join("native.sqlite3-wal")).map(|m|m.len()).unwrap_or(0);
  for mode in ["unchanged","metadata-only","task-edit"]{
   c.execute_batch("PRAGMA wal_checkpoint(TRUNCATE)").unwrap();let mut ms=vec![];
   for i in 0..8{
    if mode=="task-edit"{a["tasks"][i]["priority"]=json!(3)}
    if mode!="unchanged"{store=json!({"todo-workbench-v1":a.to_string(),"todo-cloud-meta":format!("{mode}-{i}")}).to_string()}
    let t=Instant::now();super::super::persist_store(&mut c,"guest",&store).unwrap();ms.push(t.elapsed().as_secs_f64()*1000.);
   }
   ms.sort_by(|a,b|a.total_cmp(b));println!("store mode={mode} samples=8 store_bytes={} p50_ms={:.3} max_ms={:.3} wal_bytes={}",store.len(),(ms[3]+ms[4])/2.,ms[7],wal());
  }
  assert_eq!(history_read(&c,"guest",true,300).unwrap()["head"],8);
  assert_eq!(c.query_row("PRAGMA integrity_check",[],|r|r.get::<_,String>(0)).unwrap(),"ok");
  drop(c);std::fs::remove_dir_all(dir).unwrap();
 }
 #[test]fn journal_is_atomic_private_scoped_and_monotonic(){
  let mut c=Connection::open_in_memory().unwrap();super::super::schema(&c).unwrap();
  super::super::save(&mut c,"guest",&snapshot(0).to_string()).unwrap();
  assert_eq!(history_read(&c,"guest",true,300).unwrap()["head"],0);
  c.execute_batch("CREATE TRIGGER qa_fail_history BEFORE INSERT ON operation_history BEGIN SELECT RAISE(ABORT,'injected journal failure'); END;").unwrap();
  assert!(super::super::save(&mut c,"guest",&snapshot(3).to_string()).is_err());
  let raw:String=c.query_row("SELECT body FROM snapshots WHERE scope='guest'",[],|r|r.get(0)).unwrap();assert_eq!(serde_json::from_str::<Value>(&raw).unwrap()["tasks"][0]["priority"],0);
  c.execute_batch("DROP TRIGGER qa_fail_history").unwrap();
  let mut changed=snapshot(3);changed["tasks"][0]["notes"]=json!("other private note");
  super::super::save(&mut c,"guest",&changed.to_string()).unwrap();
  let r=history_read(&c,"guest",true,300).unwrap();assert_eq!(r["head"],1);assert_eq!(r["entries"][0]["body"]["rows"][0]["fields"]["priority"]["before"]["value"],0);assert!(!r.to_string().contains("private note"));assert!(!r.to_string().contains("secret body"));
  assert_eq!(history_read(&c,"00000000-0000-4000-8000-000000000001",true,300).unwrap()["head"],0);
  // Simulate an older executable writing without the journal, not actual user data.
  c.execute("UPDATE snapshots SET body=?1 WHERE scope='guest'",[snapshot(1).to_string()]).unwrap();
  assert_eq!(history_read(&c,"guest",true,300).unwrap()["intact"],false);
  super::super::save(&mut c,"guest",&snapshot(2).to_string()).unwrap();
  let r=history_read(&c,"guest",true,300).unwrap();assert_eq!(r["head"],3);assert_eq!(r["entries"][1]["gap"],true);
  c.execute("UPDATE operation_history SET at=?1",[Local::now().timestamp()-31*86400]).unwrap();
  assert_eq!(history_read(&c,"guest",true,300).unwrap()["entries"].as_array().unwrap().len(),0);
  super::super::save(&mut c,"guest",&snapshot(3).to_string()).unwrap();
  let r=history_read(&c,"guest",true,300).unwrap();assert_eq!(r["head"],4);assert_eq!(r["entries"].as_array().unwrap().len(),1);
 }
}
