use todo_activity_core::{collector::{Collector,Mode,Sample},messaging::{self,Batch,WebSpan,Queue},store::{Store,Quality},State,Interval,Observation,Outcome};
use std::{path::PathBuf,io::Cursor};
struct Fixture(PathBuf);
impl Fixture {
 fn new()->Self{
  static SEQ:std::sync::atomic::AtomicU64=std::sync::atomic::AtomicU64::new(0);
  let p=std::env::temp_dir().join(format!("todo-native-{}-{}-{}",std::process::id(),SEQ.fetch_add(1,std::sync::atomic::Ordering::Relaxed),std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
  std::fs::create_dir(&p).unwrap();Self(p)
 }
 fn path(&self)->PathBuf{self.0.join("activity.sqlite")}
}
impl Drop for Fixture{fn drop(&mut self){let _=std::fs::remove_dir_all(&self.0);}}
fn obs(t:i64,state:State)->Observation{Observation{wall_ms:t,monotonic_ms:t as u64,state}}
fn active()->State{State::Active("org.todo.fixture.editor".into())}
fn batch(start:i64)->Batch{Batch{version:1,spans:vec![WebSpan{start_ms:start,end_ms:start+100,domain:"example.org".into(),private:false}]}}
fn allow()->Vec<String>{vec!["example.org".into()]}
#[test]
fn lifecycle_default_off_pause_resume_and_coverage(){
 let f=Fixture::new();let mut s=Store::open(&f.path()).unwrap();let mut c=Collector::new("d","app");
 assert_eq!(c.mode,Mode::Off);assert!(c.observe(&mut s,obs(100,active()),Quality::Event).is_err());
 c.start(&s,100).unwrap();assert_eq!(c.observe(&mut s,obs(100,active()),Quality::Event).unwrap(),Outcome::Anchor);
 c.observe(&mut s,obs(200,State::Idle),Quality::Event).unwrap();
 c.observe(&mut s,obs(300,State::Locked),Quality::Sampled).unwrap();
 c.observe(&mut s,obs(400,State::Suspended),Quality::Event).unwrap();
 c.pause(&s,400).unwrap();assert!(c.observe(&mut s,obs(500,active()),Quality::Event).is_err());
 c.start(&s,1000).unwrap();assert_eq!(c.observe(&mut s,obs(1000,active()),Quality::Sampled).unwrap(),Outcome::Anchor);
 c.observe(&mut s,obs(1100,State::Excluded),Quality::Sampled).unwrap();c.stop(&s,1100).unwrap();
 assert_eq!(s.coverage("d","app",100,1100).unwrap(),(400,400,1000));
 let db=rusqlite::Connection::open(f.path()).unwrap();
 assert_eq!(db.query_row("SELECT quality FROM activity_sessions WHERE start_ms=100",[],|r|r.get::<_,String>(0)).unwrap(),"event");
 assert_eq!(db.query_row("SELECT count(*) FROM diagnostics",[],|r|r.get::<_,i64>(0)).unwrap(),4);
}
#[test]
fn restart_and_long_gap_are_not_active(){
 let f=Fixture::new();let mut s=Store::open(&f.path()).unwrap();let mut c=Collector::new("d","app");
 c.start(&s,100).unwrap();c.observe(&mut s,obs(100,active()),Quality::Sampled).unwrap();c.observe(&mut s,obs(200,active()),Quality::Sampled).unwrap();
 drop(c);drop(s);
 let mut s=Store::open(&f.path()).unwrap();let mut c=Collector::new("d","app");c.start(&s,1000).unwrap();
 c.observe(&mut s,obs(1000,active()),Quality::Sampled).unwrap();c.observe(&mut s,obs(21_000,active()),Quality::Sampled).unwrap();
 assert_eq!(s.coverage("d","app",100,21_000).unwrap(),(100,20_100,20_900));
}
#[test]
fn failed_commit_does_not_advance_engine(){
 let f=Fixture::new();let mut s=Store::open(&f.path()).unwrap();let mut c=Collector::new("d","app");c.start(&s,100).unwrap();
 c.observe(&mut s,obs(100,active()),Quality::Sampled).unwrap();
 let db=rusqlite::Connection::open(f.path()).unwrap();db.execute_batch("CREATE TRIGGER fail_insert BEFORE INSERT ON activity_sessions BEGIN SELECT RAISE(ABORT,'fixture failure'); END;").unwrap();
 assert!(c.observe(&mut s,obs(200,State::Idle),Quality::Sampled).is_err());
 db.execute_batch("DROP TRIGGER fail_insert").unwrap();
 assert!(matches!(c.observe(&mut s,obs(200,State::Idle),Quality::Sampled).unwrap(),Outcome::Interval(_)));
}
#[test]
fn sensitive_metadata_filtered_before_storage(){
 let raw=r#"{"wall_ms":100,"monotonic_ms":100,"state":"active","subject":"com.private.password","reason":"event"}"#;
 let sample:Sample=serde_json::from_str(raw).unwrap();
 assert_eq!(sample.observation(&[]).unwrap().0.state,State::Excluded);
 assert!(serde_json::from_str::<Sample>(r#"{"wall_ms":1,"monotonic_ms":1,"state":"active","subject":"app","reason":"event","title":"private"}"#).is_err());
}
#[test]
fn retention_prevents_old_replay_and_preserves_straddler(){
 let f=Fixture::new();let mut s=Store::open(&f.path()).unwrap();
 let span=|a,b|Interval{start_ms:a,end_ms:b,state:active()};
 s.append("d","app",&[span(0,100),span(100,200),span(200,300)]).unwrap();
 assert_eq!(s.retain_since("d","app",150).unwrap(),1);
 assert!(s.append("d","app",&[span(0,100)]).is_err());
 assert_eq!(s.append("d","app",&[span(100,200)]).unwrap(),0);
 assert_eq!(s.retain_since("d","app",400).unwrap(),2);
 assert_eq!(s.watermark("d","app").unwrap(),400);
 assert!(s.append("d","app",&[span(200,300)]).is_err());
}
#[test]
fn migration_preserves_v1_rows(){
 let f=Fixture::new();let db=rusqlite::Connection::open(f.path()).unwrap();
 db.execute_batch("PRAGMA application_id=1413563220; PRAGMA user_version=1; CREATE TABLE activity_sessions(device TEXT NOT NULL,stream TEXT NOT NULL,start_ms INTEGER NOT NULL,end_ms INTEGER NOT NULL,state TEXT NOT NULL,subject TEXT NOT NULL,PRIMARY KEY(device,stream,start_ms)) WITHOUT ROWID; INSERT INTO activity_sessions VALUES('d','app',100,200,'active','app');").unwrap();drop(db);
 let s=Store::open(&f.path()).unwrap();assert_eq!(s.totals("d","app",100,200).unwrap()[0].2,100);
 let db=rusqlite::Connection::open(f.path()).unwrap();assert_eq!(db.query_row("PRAGMA user_version",[],|r|r.get::<_,i64>(0)).unwrap(),2);
}
#[test]
fn origin_frame_limits_and_truncation(){
 let id="abcdefghijklmnopabcdefghijklmnop";
 assert!(messaging::origin_allowed(&format!("chrome-extension://{id}/"),id));
 assert!(!messaging::origin_allowed("chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/",id));
 assert!(!messaging::origin_allowed("https://example.org/",id));
 let mut buf=Vec::new();messaging::write_frame(&mut buf,b"{}").unwrap();assert_eq!(messaging::read_frame(&mut Cursor::new(buf)).unwrap(),Some(b"{}".to_vec()));
 assert!(messaging::read_frame(&mut Cursor::new((65537u32).to_ne_bytes())).is_err());
 assert!(messaging::read_frame(&mut Cursor::new(vec![1,0])).is_err());
 assert!(messaging::read_frame(&mut Cursor::new([2u32.to_ne_bytes().as_slice(),b"x"].concat())).is_err());
}
#[test]
fn domain_private_conflicting_retry_and_queue(){
 let f=Fixture::new();let receiver=Fixture::new();let mut s=Store::open(&f.path()).unwrap();let mut r=Store::open(&receiver.path()).unwrap();
 let mut q=Queue::new(&mut s,2);let a=q.push(&batch(0),&allow()).unwrap();let b=q.push(&batch(100),&allow()).unwrap();
 assert!(q.push(&batch(200),&allow()).is_err());assert!(!q.acknowledge(b).unwrap());
 drop(q);drop(s);
 let mut s=Store::open(&f.path()).unwrap();let mut q=Queue::new(&mut s,2);
 let (id,body)=q.front().unwrap().unwrap();assert_eq!(id,a);
 assert_eq!(messaging::receive(&mut r,"d","web",&body,&allow()).unwrap(),1);
 assert_eq!(messaging::receive(&mut r,"d","web",&body,&allow()).unwrap(),0);
 assert!(q.acknowledge(id).unwrap());assert_eq!(q.front().unwrap().unwrap().0,b);
 let mut private=batch(200);private.spans[0].private=true;assert!(q.push(&private,&allow()).is_err());
 for domain in ["https://example.org/x","127.0.0.1","localhost","EXAMPLE.org","example.org?token=x"]{
  let mut x=batch(200);x.spans[0].domain=domain.into();assert!(x.intervals().is_err());
 }
 let mut x=batch(0);x.spans[0].end_ms=90;assert!(messaging::receive(&mut r,"d","web",&serde_json::to_vec(&x).unwrap(),&allow()).is_err());
 let mut x=batch(200);x.spans[0].domain="other.example.org".into();assert!(q.push(&x,&allow()).is_err());
}
