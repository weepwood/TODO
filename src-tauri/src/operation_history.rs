// Local, bounded, commit-level journal. The workspace remains authoritative.
use super::*;
use serde_json::{json,Value};
use sha2::{Digest,Sha256};
use std::collections::{BTreeMap,BTreeSet};
const SAFE:&[&str]=&["title","priority","listId","sectionId","tags","date","time","anchor","duration","deadline","planMinutes","planSegments","deletedAt"];
const DAYS:i64=30*86400;
fn fingerprint(v:&Value)->String{format!("{:x}",Sha256::digest(v.to_string().as_bytes()))}
fn task_map(v:&Value)->BTreeMap<String,Value>{
 v["tasks"].as_array().into_iter().flatten().filter_map(|t|Some((t["id"].as_str()?.to_owned(),t.clone()))).collect()
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
pub(super) fn history_schema(c:&Connection)->rusqlite::Result<()>{
 c.execute_batch("CREATE TABLE IF NOT EXISTS operation_history_head(scope TEXT PRIMARY KEY, version INTEGER NOT NULL, fingerprint TEXT NOT NULL); CREATE TABLE IF NOT EXISTS operation_history(scope TEXT NOT NULL, version INTEGER NOT NULL, at INTEGER NOT NULL, source TEXT NOT NULL, kind TEXT NOT NULL, request_id TEXT, group_id TEXT, body TEXT NOT NULL, PRIMARY KEY(scope,version)); CREATE INDEX IF NOT EXISTS operation_history_age ON operation_history(scope,at);")
}
pub(super) fn append_history(c:&Connection,scope:&str,prior:Option<&Value>,next:&Value,now:i64,request:Option<(&str,&str,&str,Option<&Value>)>)->Result<(),String>{
 let prior=match prior{Some(v)=>v,None=>return Ok(())};
 if prior==next{return Ok(())}
 let head:Option<(i64,String)>=c.query_row("SELECT version,fingerprint FROM operation_history_head WHERE scope=?1",[scope],|r|Ok((r.get(0)?,r.get(1)?))).optional().map_err(|e|e.to_string())?;
 let mut version=head.as_ref().map(|x|x.0).unwrap_or(0);
 let before_hash=fingerprint(prior);
 let gap=head.as_ref().is_some_and(|x|x.1!=before_hash);
 if gap{
  version+=1;
  c.execute("INSERT INTO operation_history VALUES(?1,?2,?3,'local','gap',NULL,NULL,?4)",params![scope,version,now,json!({"gap":true,"rows":[]}).to_string()]).map_err(|e|e.to_string())?;
 }
 let old=task_map(prior);let new=task_map(next);
 let mut rows=vec![];
 for id in old.keys().chain(new.keys()).collect::<BTreeSet<_>>(){
  match (old.get(id),new.get(id)){
   (None,Some(t))=>rows.push(json!({"id":id,"created":true,"afterHash":fingerprint(t)})),
   (Some(_),None)=>rows.push(json!({"id":id,"removed":true})),
   (Some(a),Some(b))=>{
    let (Some(am),Some(bm))=(a.as_object(),b.as_object())else{continue};
    let changed:Vec<_>=am.keys().chain(bm.keys()).collect::<BTreeSet<_>>().into_iter().filter(|k|*k!="activity"&&a.get(*k)!=b.get(*k)).collect();
    let changed_names:BTreeSet<&str>=changed.iter().map(|k|k.as_str()).collect();
    let (evidence,uncertain)=activity_evidence(a,b,&changed_names);
    if changed.is_empty()&&evidence.is_empty()&&!uncertain{continue}
    let mut fields=serde_json::Map::new();let mut protected=vec![];
    for k in changed{if SAFE.contains(&k.as_str()){fields.insert(k.clone(),json!({"before":field(a,k),"after":field(b,k)}));}else{protected.push(k)}}
    rows.push(json!({"id":id,"fields":fields,"protected":protected,"activityEvidence":evidence,"activityUncertain":uncertain}));
   },_=>{}
  }
 }
 // Never store full workspace, note bodies, links, checklists, or execution records.
 if let Some((id,"batch-capture",_,_))=request{for row in &mut rows{if row["created"]!=true||!row["id"].as_str().is_some_and(|x|x.starts_with(&format!("{id}:"))){row["unattributed"]=json!(true)}}}
 let other:Vec<_>=prior.as_object().into_iter().flatten().map(|(k,_)|k).chain(next.as_object().into_iter().flatten().map(|(k,_)|k)).collect::<BTreeSet<_>>().into_iter().filter(|k|*k!="tasks"&&prior.get(*k)!=next.get(*k)).collect();
 // Activity evidence without a net business change also creates a version.
 if !rows.is_empty()||!other.is_empty(){
  version+=1;
  let (source,kind,rid,group)=match request{Some((id,kind,group,_))=>("cli",kind,Some(id),Some(group)),None=>("local","workspace-save",None,None)};
  let mut body=json!({"rows":rows,"protectedWorkspace":other});
  if let Some((_,_,_,Some(approval)))=request{body["confirmation"]=approval.clone();}
  if body.to_string().len()>262144{body=json!({"gap":true,"rows":[],"reason":"commit exceeds history body limit"})}
  c.execute("INSERT INTO operation_history VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",params![scope,version,now,source,kind,rid,group,body.to_string()]).map_err(|e|e.to_string())?;
 }
 c.execute("INSERT INTO operation_history_head VALUES(?1,?2,?3) ON CONFLICT(scope) DO UPDATE SET version=excluded.version,fingerprint=excluded.fingerprint",params![scope,version,fingerprint(next)]).map_err(|e|e.to_string())?;
 c.execute("DELETE FROM operation_history WHERE scope=?1 AND (at<?2 OR version<=?3)",params![scope,now-DAYS,version-300]).map_err(|e|e.to_string())?;
 // Also bound aggregate retained values to 16 MiB per scope.
 c.execute("DELETE FROM operation_history WHERE scope=?1 AND version IN (SELECT version FROM (SELECT version,SUM(length(CAST(body AS BLOB))) OVER (ORDER BY version DESC) AS total FROM operation_history WHERE scope=?1) WHERE total>16777216)",[scope]).map_err(|e|e.to_string())?;
 Ok(())
}
pub(super) fn history_read(c:&Connection,scope:&str,detail:bool,limit:i64)->Result<Value,String>{
 let now=Local::now().timestamp();
 let head:Option<(i64,String)>=c.query_row("SELECT version,fingerprint FROM operation_history_head WHERE scope=?1",[scope],|r|Ok((r.get(0)?,r.get(1)?))).optional().map_err(|e|e.to_string())?;
 let current:Option<String>=c.query_row("SELECT body FROM snapshots WHERE scope=?1",[scope],|r|r.get(0)).optional().map_err(|e|e.to_string())?;
 let intact=head.as_ref().is_none_or(|h|current.as_ref().and_then(|s|serde_json::from_str::<Value>(s).ok()).is_some_and(|v|fingerprint(&v)==h.1));
 let mut q=c.prepare("SELECT version,at,source,kind,request_id,group_id,body FROM operation_history WHERE scope=?1 AND at>=?2 ORDER BY version DESC LIMIT ?3").map_err(|e|e.to_string())?;
 let mut rows=q.query(params![scope,now-DAYS,limit.clamp(1,300)]).map_err(|e|e.to_string())?;
 let mut out=vec![];let mut bytes=0;
 while let Some(r)=rows.next().map_err(|e|e.to_string())?{
  let raw:String=r.get(6).map_err(|e|e.to_string())?;
  let body:Value=serde_json::from_str(&raw).map_err(|e|e.to_string())?;
  let row=json!({"version":r.get::<_,i64>(0).map_err(|e|e.to_string())?,"at":r.get::<_,i64>(1).map_err(|e|e.to_string())?,"source":r.get::<_,String>(2).map_err(|e|e.to_string())?,"kind":r.get::<_,String>(3).map_err(|e|e.to_string())?,"requestId":r.get::<_,Option<String>>(4).map_err(|e|e.to_string())?,"groupId":r.get::<_,Option<String>>(5).map_err(|e|e.to_string())?,"count":body["rows"].as_array().map(|a|a.len()).unwrap_or(0),"gap":body["gap"]==true,"body":if detail{body}else{Value::Null}});
  bytes+=row.to_string().len();if bytes>400000{break}out.push(row);
 }
 Ok(json!({"head":head.map(|h|h.0).unwrap_or(0),"intact":intact,"entries":out,"retentionDays":30,"workspaceFingerprint":current.map(|raw|format!("{:x}",Sha256::digest(raw.as_bytes())))}))
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
