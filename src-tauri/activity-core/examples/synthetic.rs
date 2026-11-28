// Synthetic only. Never accept a user-selected database path.
use std::time::{Instant,SystemTime,UNIX_EPOCH};
use todo_activity_core::{Engine,Observation,Outcome,State,coalesce};
use todo_activity_core::store::Store;
fn main() -> Result<(),String> {
 let dir=std::env::temp_dir().join(format!("todo-activity-synthetic-{}-{}",std::process::id(),SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()));
 std::fs::create_dir(&dir).map_err(|e|e.to_string())?;
 let path=dir.join("activity.sqlite");
 let result=(||{
  let mut store=Store::open(&path)?;
  let mut engine=Engine::new(10_000,100);
  let mut intervals=Vec::new();
  let started=Instant::now();
  // 90 days * 480 spans/day. Each span represents one minute, observed
  // at five-second checkpoints. No real device IDs or app observations.
  let days=90i64;
  let day_ms=86_400_000i64;
  let mut inserted=0usize;
  let mut oracle=0i64;
  for day in 0..days {
    for tick in 0..=5760i64 {
      let t=day*day_ms+tick*5000;
      let kind=(tick/12)%4;
      let state=match kind{0=>State::Active("com.example.editor".into()),1=>State::Active("com.example.browser".into()),2=>State::Idle,_=>State::Locked};
      if let Outcome::Interval(span)=engine.observe(Observation{wall_ms:t,monotonic_ms:t as u64,state}) {
        if matches!(span.state,State::Active(_)){oracle+=span.duration_ms();}
        intervals.push(span);
      }
    }
    let batch=coalesce(&intervals).map_err(str::to_owned)?;
    inserted+=store.append("fixture","app",&batch)?;
    assert_eq!(store.append("fixture","app",&batch)?,0);
    intervals.clear();
  }
  let ingest_ms=started.elapsed().as_millis();
  let begin=Instant::now();
  let totals=store.totals("fixture","app",0,days*day_ms)?;
  let query_us=begin.elapsed().as_micros();
  let actual=totals.iter().filter(|r|r.0=="active").map(|r|r.2).sum::<i64>();
  assert_eq!(actual,oracle);
  assert_eq!(actual,days*240*60*1000);
  drop(store);
  let bytes=std::fs::metadata(&path).map_err(|e|e.to_string())?.len();
  println!("synthetic_days={days} rows={inserted} active_ms={actual} sqlite_bytes={bytes} ingest_and_exact_retry_ms={ingest_ms} aggregate_query_us={query_us}");
  Ok(())
 })();
 let cleanup=std::fs::remove_dir_all(&dir).map_err(|e|e.to_string());
 result.and(cleanup)
}
