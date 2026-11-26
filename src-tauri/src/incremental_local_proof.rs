// Independent read-only proof experiment. No production authorization or writes.
// A local proof proves the selected bucket relative to an audited revision;
// it cannot establish integrity of untouched buckets or an untrusted DB.
use super::*;
use serde_json::{Value,json};
use sha2::{Digest,Sha256};
use std::collections::{BTreeMap,BTreeSet};
type R<T>=Result<T,String>;
const S:&str="guest";
fn sha(raw:&str)->String{format!("{:x}",Sha256::digest(raw.as_bytes()))}
fn bucket(id:&str)->usize{Sha256::digest(id.as_bytes())[0] as usize}
fn err(e:rusqlite::Error)->String{e.to_string()}
type Row=(String,i64,String);
struct Proof{rev:i64,canonical:String,buckets:Vec<BTreeMap<String,(i64,String)>>,hashes:Vec<String>}
fn hash_bucket(b:usize,m:&BTreeMap<String,(i64,String)>)->String{sha(&json!(["r4-local-v1",b,m]).to_string())}
fn root(p:&Proof)->String{sha(&json!(["r4-read-root-v2",S,p.rev,p.canonical,p.hashes]).to_string())}
fn current_head(c:&Connection)->R<(i64,String)>{c.query_row("SELECT rev,body_hash FROM r3_head WHERE scope=?1",[S],|r|Ok((r.get(0)?,r.get(1)?))).map_err(err)}
fn capture(c:&Connection)->R<Proof>{
 let (rev,canonical)=current_head(c)?;
 let v=incremental_single::export(c,S)?;
 let state:Value=serde_json::from_str(v["todo-workbench-v1"].as_str().ok_or("body")?).map_err(|e|e.to_string())?;
 let mut buckets=vec![BTreeMap::new();256];
 for(i,t)in state["tasks"].as_array().ok_or("tasks")?.iter().enumerate(){let id=t["id"].as_str().ok_or("id")?;buckets[bucket(id)].insert(id.to_owned(),(i as i64,sha(&t.to_string())));}
 if current_head(c)?!=(rev,canonical.clone())||sha(v["todo-workbench-v1"].as_str().ok_or("body")?)!=canonical{return Err("audit head changed".into())}
 let hashes=buckets.iter().enumerate().map(|(b,m)|hash_bucket(b,m)).collect();Ok(Proof{rev,canonical,buckets,hashes})
}
fn read_bucket(c:&Connection,p:&Proof,b:usize)->R<Vec<Value>>{
 let tx=c.unchecked_transaction().map_err(err)?;
 if current_head(&tx)?!=(p.rev,p.canonical.clone())||b>=256{return Err("stale proof".into())}
 let expected=&p.buckets[b];let mut rows=vec![];let mut actual=BTreeMap::new();
 let mut q=tx.prepare("SELECT pos,body,hash FROM r3_task WHERE scope=?1 AND id=?2").map_err(err)?;
 for(id,(pos,h))in expected{
  let row:Row=q.query_row(params![S,id],|r|Ok((r.get::<_,String>(1)?,r.get::<_,i64>(0)?,r.get::<_,String>(2)?))).map_err(err)?;
  let t:Value=serde_json::from_str(&row.0).map_err(|e|e.to_string())?;
  if t["id"]!=id.as_str()||row.1!=*pos||sha(&row.0)!=*h||row.2!=*h{return Err("selected row mismatch".into())}
  actual.insert(id.clone(),(row.1,row.2));rows.push(t);
 }
 if hash_bucket(b,&actual)!=p.hashes[b]{return Err("bucket proof mismatch".into())}
 drop(q);tx.commit().map_err(err)?;Ok(rows)
}
// Only after a successful R3 canonical commit, existing row replacement
// can advance the in-memory proof. Structural or metadata operations need re-audit.
fn advance(c:&Connection,p:&mut Proof,changes:&[(Value,Value)],rev:i64,canonical:&str)->R<()>{
 if rev!=p.rev+1||current_head(c)?!=(rev,canonical.to_owned()){return Err("revision mismatch".into())}
 let mut seen=BTreeSet::new();let mut affected=BTreeSet::new();
 for(a,b)in changes{
  let id=a["id"].as_str().ok_or("id")?;if b["id"]!=id||!seen.insert(id){return Err("invalid change".into())}
  let k=bucket(id);let (pos,h)=p.buckets[k].get(id).ok_or("unknown row")?;
  if sha(&a.to_string())!=*h{return Err("old proof mismatch".into())}
  let (actual_pos,raw,actual_hash):(i64,String,String)=c.query_row("SELECT pos,body,hash FROM r3_task WHERE scope=?1 AND id=?2",params![S,id],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).map_err(err)?;
  if actual_pos!=*pos||raw!=b.to_string()||sha(&raw)!=actual_hash{return Err("committed proof mismatch".into())}
  affected.insert(k);
 }
 for(_,b)in changes{let id=b["id"].as_str().unwrap();let k=bucket(id);let pos=p.buckets[k][id].0;p.buckets[k].insert(id.into(),(pos,sha(&b.to_string())));}
 for k in affected{p.hashes[k]=hash_bucket(k,&p.buckets[k]);}p.rev=rev;p.canonical=canonical.into();Ok(())
}
// The proof owner derives changes from the exact envelope it commits. A caller
// cannot advance using a selected subset of a larger transaction. On any
// ambiguous or unsupported result the proof is invalidated, not reused.
fn commit_with_proof(c:&mut Connection,p:&mut Option<Proof>,patch:&Value)->R<(i64,String)>{
 let prior=p.take().ok_or("proof missing; full audit required")?;
 let base=prior.rev;
 if current_head(c)?!=(base,prior.canonical.clone()){return Err("proof stale".into())}
 if !patch["order"].is_null()||!patch["meta"].is_null()||!patch["keys"].as_array().is_some_and(|a|a.is_empty())||!patch["remove"].as_array().is_some_and(|a|a.is_empty()){return Err("structural patch requires full audit".into())}
 let puts=patch["put"].as_array().ok_or("puts")?;
 if puts.is_empty()||puts.iter().any(|x|x["before"].is_null()){return Err("existing rows required".into())}
 let changes=puts.iter().map(|x|(x["before"].clone(),x["after"].clone())).collect::<Vec<_>>();
 let (rev,hash)=incremental_single::commit(c,S,&uuid::Uuid::new_v4().to_string(),base,patch,None,false)?;
 let mut next=prior;
 // A post-commit proof failure never implies the database transaction failed.
 // Keep proof absent and force authoritative reload/re-audit.
 if advance(c,&mut next,&changes,rev,&hash).is_ok(){*p=Some(next)}
 Ok((rev,hash))
}
#[test]#[ignore]fn audited_local_read_and_incremental_proof(){
 use std::time::Instant;
 let path=std::env::var("TODO_R4_PROOF_COPY").expect("isolated copy path");
 let path=std::path::PathBuf::from(path);
 let expected=std::path::PathBuf::from("/Volumes/data/AI-Development/artifacts/TODO/incremental-native-r4-quality/proof-copy.sqlite3");
 assert_eq!(path,expected);assert_eq!(std::fs::canonicalize(&path).unwrap(),expected);
 #[cfg(unix)]{use std::os::unix::fs::MetadataExt;assert_eq!(std::fs::metadata(&path).unwrap().nlink(),1);}

 let mut c=Connection::open(path).unwrap();
 let start=Instant::now();let mut proof=Some(capture(&c).unwrap());let audit_ms=start.elapsed().as_secs_f64()*1000.;
 let mut times=vec![];let mut updates=vec![];let mut counts=vec![];
 for i in 100..130{
  let id=format!("qa-{i}");let b=bucket(&id);let t=Instant::now();let rows=read_bucket(&c,proof.as_ref().unwrap(),b).unwrap();times.push(t.elapsed().as_secs_f64()*1000.);counts.push(rows.len());
  let old=rows.into_iter().find(|r|r["id"]==id).unwrap();let mut next=old.clone();next["priority"]=json!(2);
  let p=json!({"put":[{"id":id,"before":old,"after":next}],"remove":[],"order":null,"meta":null,"keys":[]});
  let previous=proof.take().unwrap();
  let stale_rev=previous.rev;let stale_hash=previous.canonical.clone();
  proof=Some(previous);
  let t=Instant::now();let (new_rev,new_hash)=commit_with_proof(&mut c,&mut proof,&p).unwrap();updates.push(t.elapsed().as_secs_f64()*1000.);
  let current=proof.as_ref().unwrap();
  assert_eq!(new_rev,stale_rev+1);assert_eq!(new_hash,current.canonical);assert_ne!(new_hash,stale_hash);
  assert!(read_bucket(&c,current,b).is_ok());
  if i%10==9{let independent=capture(&c).unwrap();assert_eq!(root(current),root(&independent));assert_eq!(current.rev,independent.rev);}

 }
 // Demonstrate the precise failure boundary: unseen corruption is NOT
 // certified by a successful read of a different bucket.
 // An external commit, even a metadata-only one, invalidates proof lineage.
 let prior=proof.take().unwrap();let v=incremental_single::export(&c,S).unwrap();let before:Value=serde_json::from_str(v["todo-workbench-v1"].as_str().unwrap()).unwrap();
 let mut after=before.clone();after["theme"]=json!("light");if before["theme"]==after["theme"]{after["theme"]=json!("dark")}
 let mut k=v.clone();k.as_object_mut().unwrap().remove("todo-workbench-v1");
 let external=incremental_single::delta(&before,&after,&k,&k);
 incremental_single::commit(&mut c,S,&uuid::Uuid::new_v4().to_string(),prior.rev,&external,None,false).unwrap();
 assert!(read_bucket(&c,&prior,0).is_err());proof=Some(prior);
 assert!(commit_with_proof(&mut c,&mut proof,&external).is_err());assert!(proof.is_none());
 proof=Some(capture(&c).unwrap());
 // Unsupported structural operations fail before commit and invalidate proof.
 let invalid=external.clone();let rev=proof.as_ref().unwrap().rev;
 assert!(commit_with_proof(&mut c,&mut proof,&invalid).is_err());assert!(proof.is_none());assert_eq!(current_head(&c).unwrap().0,rev);
 let proof=capture(&c).unwrap();
 let id="qa-100";let b=bucket(id);let other=(0..256).find(|x|*x!=b&&!proof.buckets[*x].is_empty()).unwrap();
 c.execute("UPDATE r3_task SET body='{}' WHERE scope=?1 AND id=?2",params![S,id]).unwrap();
 assert!(read_bucket(&c,&proof,b).is_err());assert!(read_bucket(&c,&proof,other).is_ok());assert!(capture(&c).is_err());
 times.sort_by(|a,b|a.total_cmp(b));updates.sort_by(|a,b|a.total_cmp(b));
 println!("R4 proof samples=30 full_audit_ms={audit_ms:.3} local_read_p50_ms={:.3} local_read_p95_ms={:.3} canonical_commit_and_proof_p50_ms={:.3} rows_min={} rows_max={} external_revision_and_structural_gate=true untouched_corruption_requires_full_audit=true",(times[14]+times[15])/2.,times[28],(updates[14]+updates[15])/2.,counts.iter().min().unwrap(),counts.iter().max().unwrap());
}
