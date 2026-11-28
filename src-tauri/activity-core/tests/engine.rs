use todo_activity_core::{Engine,Interval,Observation,Outcome,State,coalesce,website_totals};
use todo_activity_core::store::Store;
use std::path::PathBuf;
fn active(id:&str)->State { State::Active(id.into()) }
fn span(a:i64,b:i64,state:State)->Interval { Interval{start_ms:a,end_ms:b,state} }
fn obs(w:i64,m:u64,state:State)->Observation { Observation{wall_ms:w,monotonic_ms:m,state} }
#[test]
fn foreground_idle_lock_sleep_and_exclusion() {
 let mut e=Engine::new(10_000,100);
 let states=[active("com.example.editor"),active("com.example.browser"),State::Idle,State::Locked,State::Suspended,State::Unknown,State::Excluded,State::Disabled];
 assert_eq!(e.observe(obs(1000,1000,states[0].clone())),Outcome::Anchor);
 for (i,pair) in states.windows(2).enumerate() {
  let start=1000+i as i64*1000;
  assert_eq!(e.observe(obs(start+1000,(start+1000) as u64,pair[1].clone())),Outcome::Interval(span(start,start+1000,pair[0].clone())));
 }
}
#[test]
fn lost_heartbeat_is_unknown_and_not_previous_app() {
 let mut e=Engine::new(5000,100);
 e.observe(obs(1000,1000,active("a")));
 assert_eq!(e.observe(obs(601000,601000,active("b"))),Outcome::Interval(span(1000,601000,State::Unknown)));
 assert_eq!(e.observe(obs(602000,602000,active("b"))),Outcome::Interval(span(601000,602000,active("b"))));
}
#[test]
fn clock_forward_backward_and_duplicate_do_not_invent_time() {
 let mut e=Engine::new(5000,100);
 e.observe(obs(1000,1000,active("a")));
 assert_eq!(e.observe(obs(2000,2000,active("a"))),Outcome::Interval(span(1000,2000,active("a"))));
 assert_eq!(e.observe(obs(900,3000,active("a"))),Outcome::ClockDiscontinuity);
 assert_eq!(e.observe(obs(1500,4000,active("a"))),Outcome::ClockDiscontinuity);
 assert_eq!(e.observe(obs(2000,4500,active("b"))),Outcome::Anchor);
 assert_eq!(e.observe(obs(2000,4500,active("b"))),Outcome::Rejected);
 assert_eq!(e.observe(obs(100_000,5500,active("b"))),Outcome::ClockDiscontinuity);
 assert_eq!(e.observe(obs(101_000,6500,active("b"))),Outcome::Interval(span(100_000,101_000,active("b"))));
}
#[test]
fn restart_does_not_bridge_downtime() {
 let mut e=Engine::new(5000,100).with_watermark(2000);
 assert_eq!(e.observe(obs(1900,1,active("a"))),Outcome::ClockDiscontinuity);
 assert_eq!(e.observe(obs(10000,8101,active("a"))),Outcome::Anchor);
 assert_eq!(e.observe(obs(11000,9101,active("a"))),Outcome::Interval(span(10000,11000,active("a"))));
}
#[test]
fn reject_title_url_and_invalid_intervals() {
 let mut e=Engine::new(5000,100);
 for s in ["https://example.org/path?q=secret","Private document", "", "/Users/test/file"] {
  assert_eq!(e.observe(obs(1000,1000,active(s))),Outcome::Rejected);
 }
 assert!(coalesce(&[span(1,1,active("a"))]).is_err());
 assert!(coalesce(&[span(0,10,active("a")),span(9,20,active("a"))]).is_err());
}
#[test]
fn adjacent_only_merges_and_browser_is_subset() {
 let a=[span(0,10,active("editor")),span(10,20,active("browser")),span(20,25,State::Idle),span(25,30,active("browser"))];
 let w=[span(0,15,active("example.org")),span(15,30,active("docs.example.org"))];
 assert_eq!(website_totals(&a,&w,"browser").unwrap().values().sum::<i64>(),15);
 assert_eq!(website_totals(&a,&w,"browser").unwrap()["example.org"],5);
 assert_eq!(coalesce(&[span(0,5,active("a")),span(5,10,active("a")),span(11,12,active("a"))]).unwrap(),vec![span(0,10,active("a")),span(11,12,active("a"))]);
}
struct Fixture(PathBuf);
impl Fixture {
 fn new()->Self{
  let p=std::env::temp_dir().join(format!("todo-activity-test-{}-{}",std::process::id(),std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
  std::fs::create_dir(&p).unwrap();Self(p)
 }
 fn path(&self)->PathBuf { self.0.join("activity.sqlite") }
}
impl Drop for Fixture { fn drop(&mut self){let _=std::fs::remove_dir_all(&self.0);} }
#[test]
fn file_reopen_replay_and_atomic_conflict() {
 let f=Fixture::new();
 let b=[span(100,200,active("a")),span(200,300,State::Idle)];
 {
  let mut s=Store::open(&f.path()).unwrap();
  assert_eq!(s.append("d","app",&b).unwrap(),2);
  assert_eq!(s.append("d","app",&b).unwrap(),0);
  assert!(s.append("d","app",&[span(300,400,active("b")),span(100,201,active("a"))]).is_err());
  assert_eq!(s.watermark("d","app").unwrap(),300);
  assert!(s.append("d","app",&[span(99,101,active("b"))]).is_err());
  assert!(s.append("d","app",&[span(201,299,active("b"))]).is_err());
 }
 let s=Store::open(&f.path()).unwrap();
 assert_eq!(s.totals("d","app",150,250).unwrap(),vec![("active".into(),"a".into(),50),("idle".into(),"".into(),50)]);
}
#[test]
fn foreign_database_rejected_without_modification() {
 let f=Fixture::new();
 let c=rusqlite::Connection::open(f.path()).unwrap();
 c.execute_batch("CREATE TABLE snapshots(id TEXT); INSERT INTO snapshots VALUES('keep');").unwrap();
 drop(c);
 let before=std::fs::read(f.path()).unwrap();
 assert!(Store::open(&f.path()).is_err());
 assert_eq!(std::fs::read(f.path()).unwrap(),before);
}
#[test]
fn independent_device_stream_and_day_bounds() {
 let f=Fixture::new();
 let mut s=Store::open(&f.path()).unwrap();
 let day=23*60*60*1000;
 for (device,stream) in [("d1","app"),("d1","web"),("d2","app")] {
  s.append(device,stream,&[span(0,day+100,active("a"))]).unwrap();
 }
 assert_eq!(s.totals("d1","app",0,day).unwrap()[0].2,day);
 assert_eq!(s.totals("d1","app",day,day+1000).unwrap()[0].2,100);
}
#[test]
fn interval_intersection_matches_independent_discrete_oracle() {
 let mut seed=42u64;
 let mut next=||{seed=seed.wrapping_mul(6364136223846793005).wrapping_add(1);(seed>>32)%5};
 for _ in 0..100 {
  let apps:Vec<_>=(0..100).map(|t|span(t,t+1,if next()<2 {active("browser")}else{State::Idle})).collect();
  let webs:Vec<_>=(0..100).map(|t|span(t,t+1,if next()<2 {active("example.org")}else{State::Unknown})).collect();
  let expected=apps.iter().zip(&webs).filter(|(a,b)|a.state==active("browser")&&b.state==active("example.org")).count() as i64;
  assert_eq!(website_totals(&apps,&webs,"browser").unwrap().get("example.org").copied().unwrap_or(0),expected);
 }
}
#[test]
fn concurrent_writers_reject_overlapping_spans() {
 let f=Fixture::new();
 let a=Store::open(&f.path()).unwrap();
 let b=Store::open(&f.path()).unwrap();
 let barrier=std::sync::Arc::new(std::sync::Barrier::new(2));
 let run=|mut s:Store,interval:Interval,barrier:std::sync::Arc<std::sync::Barrier>|std::thread::spawn(move||{
   barrier.wait();s.append("d","app",&[interval])
 });
 let x=run(a,span(0,100,active("a")),barrier.clone());
 let y=run(b,span(50,150,active("b")),barrier);
 let results=[x.join().unwrap(),y.join().unwrap()];
 assert_eq!(results.iter().filter(|r|r.is_ok()).count(),1);
 let s=Store::open(&f.path()).unwrap();
 assert_eq!(s.totals("d","app",0,200).unwrap().iter().map(|r|r.2).sum::<i64>(),100);
}
#[test]
fn schema_version_fails_closed() {
 let f=Fixture::new();drop(Store::open(&f.path()).unwrap());
 let c=rusqlite::Connection::open(f.path()).unwrap();
 c.execute_batch("PRAGMA user_version=99;").unwrap();drop(c);
 assert!(Store::open(&f.path()).is_err());
}
