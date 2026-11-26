// Offline research protocol: the source must be an explicitly copied,
// synthetic file. A SQLite write lease prevents concurrent writers while
// verifying the candidate, but does NOT fence old binaries after release.
use super::*;
use serde_json::{Value,json};
use std::{collections::BTreeMap,path::Path};
use sha2::{Digest,Sha256};
const S:&str="guest";
fn store(c:&Connection)->Value{serde_json::from_str(&c.query_row("SELECT body FROM workspace_store WHERE scope='guest'",[],|r|r.get::<_,String>(0)).unwrap()).unwrap()}
fn hash(v:&Value)->String{format!("{:x}",Sha256::digest(v.to_string().as_bytes()))}
fn check_path(p:&Path){assert_eq!(std::fs::canonicalize(p).unwrap(),p);#[cfg(unix)]{use std::os::unix::fs::MetadataExt;assert_eq!(std::fs::metadata(p).unwrap().nlink(),1);}}
#[test]#[ignore]fn actual_product_cutover_and_receipt_retention(){
 let root=Path::new("/Volumes/data/AI-Development/artifacts/TODO/incremental-product-r5");
 let src=root.join("cutover-source.sqlite3");check_path(&src);
 let target=root.join("cutover-candidate.sqlite3");let downgraded=root.join("cutover-legacy.sqlite3");
 assert!(!target.exists()&&!downgraded.exists());
 let mut c=Connection::open(&src).unwrap();
 let tx=c.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate).unwrap();
 let original=store(&tx);let source_hash=hash(&original);
 let pending:i64=tx.query_row("SELECT count(*) FROM direct_capture_requests WHERE status='pending'",[],|r|r.get(0)).unwrap();assert_eq!(pending,0);
 let mut competing=Connection::open(&src).unwrap();competing.busy_timeout(std::time::Duration::ZERO).unwrap();
 assert!(storage::persist_store(&mut competing,S,&original.to_string()).unwrap_err().contains("locked"));
 drop(competing);
 let reader=Connection::open(&src).unwrap();
 reader.execute("VACUUM INTO ?1",[target.to_str().unwrap()]).unwrap();drop(reader);
 let mut row=Connection::open(&target).unwrap();incremental_single::schema(&row).unwrap();
 // An existing pending operation must prevent migration, not be discarded.
 let rid=uuid::Uuid::new_v4().to_string();let req=json!({"op":"history-list"});
 cli::enqueue_operation(&mut row,S,&rid,req.clone()).unwrap();
 assert!(incremental_single::migrate(&mut row,S,&original,false).unwrap_err().contains("pending"));
 storage::persist_store_receipt(&mut row,S,&original.to_string(),Some(&json!({"id":rid,"status":"saved","result":{"probe":"synthetic private body"}}))).unwrap();
 // The stored request's logical expiry and physical result cleanup are
 // separate. Keep terminal UUID/digest/status so it cannot execute again.
 row.execute("UPDATE direct_capture_requests SET created_at=?2 WHERE scope='cli-op:guest' AND id=?1",params![rid,Local::now().timestamp()-8*86400]).unwrap();
 let expired=cli::receipt(&row,S,&rid).unwrap();assert_eq!(expired["result_access"],"expired");
 let duplicate=cli::enqueue_operation(&mut row,S,&rid,req).unwrap();assert_eq!(duplicate["status"],"saved");assert_eq!(duplicate["result_access"],"expired");
 let body:Option<String>=row.query_row("SELECT result FROM cli_operation_meta WHERE scope='cli-op:guest' AND id=?1",[&rid],|r|r.get(0)).unwrap();assert!(body.is_none());
 assert!(cli::enqueue_operation(&mut row,S,&rid,json!({"op":"history-show","version":1})).is_err());
 let mut stale=original.clone();stale["todo-cloud-meta"]=json!("different");
 assert!(incremental_single::migrate(&mut row,S,&stale,false).is_err());
 assert!(incremental_single::migrate(&mut row,S,&original,true).is_err());
 assert_eq!(store(&row),original);
 incremental_single::migrate(&mut row,S,&original,false).unwrap();
 assert_eq!(incremental_single::export(&row,S).unwrap(),original);
 assert_eq!(hash(&store(&tx)),source_hash);
 assert!(storage::persist_store(&mut row,S,&original.to_string()).is_err());
 // Confirm original product history and original CLI receipts survived.
 let history=|c:&Connection|{let mut q=c.prepare("SELECT version,body FROM operation_history WHERE scope='guest' ORDER BY version").unwrap();q.query_map([],|r|Ok((r.get::<_,i64>(0)?,r.get::<_,String>(1)?))).unwrap().collect::<Result<Vec<_>,_>>().unwrap()};
 assert_eq!(history(&tx),history(&row));
 let j=incremental_single::journal(&row,S).unwrap();assert_eq!(j["intact"],true);
 let before:Value=serde_json::from_str(original["todo-workbench-v1"].as_str().unwrap()).unwrap();let mut after=before.clone();after["tasks"][0]["priority"]=json!(2);
 let mut keys=original.clone();keys.as_object_mut().unwrap().remove("todo-workbench-v1");
 let p=incremental_single::delta(&before,&after,&keys,&keys);
 let id=uuid::Uuid::new_v4().to_string();let ack=incremental_single::commit(&mut row,S,&id,0,&p,None,false).unwrap();
 assert_eq!(incremental_single::commit(&mut row,S,&id,0,&p,None,false).unwrap(),ack);
 assert!(incremental_single::commit(&mut row,S,&id,1,&p,None,false).is_err());
 assert!(incremental_single::export_legacy_copy(&row,&downgraded,&BTreeMap::from([(S.to_string(),1)])).is_ok());
 let old=Connection::open(&downgraded).unwrap();assert_eq!(store(&old),incremental_single::export(&row,S).unwrap());assert_eq!(history(&old),history(&row));
 assert_eq!(cli::receipt(&old,S,&rid).unwrap()["result_access"],"expired");
 for db in [&*tx,&row,&old]{assert_eq!(db.query_row("PRAGMA integrity_check",[],|r|r.get::<_,String>(0)).unwrap(),"ok")}
 tx.commit().unwrap();
 assert_eq!(store(&c),original);
 println!("R5 copied-product cutover: write lock, pending gate, stale source, injected rollback, exact legacy export, original history/receipt and 7-day result expiry all passed; old-writer fence after lease still required");
}
