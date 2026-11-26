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
struct Proof{rev:i64,buckets:Vec<BTreeMap<String,(i64,String)>>,hashes:Vec<String>}
fn hash_bucket(b:usize,m:&BTreeMap<String,(i64,String)>)->String{sha(&json!(["r4-local-v1",b,m]).to_string())}
fn root(p:&Proof)->String{sha(&json!(["r4-read-root",p.hashes]).to_string())}
fn capture(c:&Connection)->R<Proof>{
 let rev=incremental_single::revision(c,S)?;
 let v=incremental_single::export(c,S)?;
 let state:Value=serde_json::from_str(v["todo-workbench-v1"].as_str().ok_or("body")?).map_err(|e|e.to_string())?;
 let mut buckets=vec![BTreeMap::new();256];
 for(i,t)in state["tasks"].as_array().ok_or("tasks")?.iter().enumerate(){let id=t["id"].as_str().ok_or("id")?;buckets[bucket(id)].insert(id.to_owned(),(i as i64,sha(&t.to_string())));}
 if incremental_single::revision(c,S)?!=rev{return Err("audit revision changed".into())}
 let hashes=buckets.iter().enumerate().map(|(b,m)|hash_bucket(b,m)).collect();Ok(Proof{rev,buckets,hashes})
}
fn read_bucket(c:&Connection,p:&Proof,b:usize)->R<Vec<Value>>{
 let tx=c.unchecked_transaction().map_err(err)?;
 if incremental_single::revision(&tx,S)?!=p.rev||b>=256{return Err("stale proof".into())}
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
fn advance(c:&Connection,p:&mut Proof,changes:&[(Value,Value)],rev:i64)->R<()>{
 if rev!=p.rev+1||incremental_single::revision(c,S)?!=rev{return Err("revision mismatch".into())}
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
 for k in affected{p.hashes[k]=hash_bucket(k,&p.buckets[k]);}p.rev=rev;Ok(())
}
#[test]#[ignore]fn audited_local_read_and_incremental_proof(){
 use std::time::Instant;
 let path=std::env::var("TODO_R4_PROOF_COPY").expect("isolated copy path");
 assert!(path.contains("/artifacts/TODO/incremental-native-r4/")&&path.ends_with("/proof-copy.sqlite3"));
 let mut c=Connection::open(path).unwrap();
 let start=Instant::now();let mut proof=capture(&c).unwrap();let audit_ms=start.elapsed().as_secs_f64()*1000.;
 let mut times=vec![];let mut updates=vec![];let mut counts=vec![];
 for i in 100..130{
  let id=format!("qa-{i}");let b=bucket(&id);let t=Instant::now();let rows=read_bucket(&c,&proof,b).unwrap();times.push(t.elapsed().as_secs_f64()*1000.);counts.push(rows.len());
  let old=rows.into_iter().find(|r|r["id"]==id).unwrap();let mut next=old.clone();next["priority"]=json!(2);
  let p=json!({"put":[{"id":id,"before":old,"after":next}],"remove":[],"order":null,"meta":null,"keys":[]});
  let rev=proof.rev;let (new_rev,_)=incremental_single::commit(&mut c,S,&uuid::Uuid::new_v4().to_string(),rev,&p,None,false).unwrap();
  assert!(read_bucket(&c,&proof,b).is_err());
  let t=Instant::now();advance(&c,&mut proof,&[(old,next)],new_rev).unwrap();updates.push(t.elapsed().as_secs_f64()*1000.);
  assert!(read_bucket(&c,&proof,b).is_ok());
  if i%10==9{let independent=capture(&c).unwrap();assert_eq!(root(&proof),root(&independent));assert_eq!(proof.rev,independent.rev);}
 }
 // Demonstrate the precise failure boundary: unseen corruption is NOT
 // certified by a successful read of a different bucket.
 let id="qa-100";let b=bucket(id);let other=(0..256).find(|x|*x!=b&&!proof.buckets[*x].is_empty()).unwrap();
 c.execute("UPDATE r3_task SET body='{}' WHERE scope=?1 AND id=?2",params![S,id]).unwrap();
 assert!(read_bucket(&c,&proof,b).is_err());assert!(read_bucket(&c,&proof,other).is_ok());assert!(capture(&c).is_err());
 times.sort_by(|a,b|a.total_cmp(b));updates.sort_by(|a,b|a.total_cmp(b));
 println!("R4 proof samples=30 full_audit_ms={audit_ms:.3} local_read_p50_ms={:.3} local_read_p95_ms={:.3} proof_update_p50_ms={:.3} rows_min={} rows_max={} untouched_corruption_requires_full_audit=true",(times[14]+times[15])/2.,times[28],(updates[14]+updates[15])/2.,counts.iter().min().unwrap(),counts.iter().max().unwrap());
}
