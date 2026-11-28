// Deliberately restricted to the explicitly authorized local date.
// No report serialization, subject identities, raw events or website requests.
use chrono::{Local,NaiveDate,TimeZone,Utc};
use todo_activitywatch::Provider;
fn run()->Result<(),String>{
    let day=NaiveDate::from_ymd_opt(2026,11,29).unwrap();
    let start=Local.from_local_datetime(&day.and_hms_opt(0,0,0).unwrap()).single().ok_or("ambiguous day")?.timestamp_millis();
    let day_end=Local.from_local_datetime(&day.succ_opt().unwrap().and_hms_opt(0,0,0).unwrap()).single().ok_or("ambiguous end")?.timestamp_millis();
    let end=std::env::args().nth(1).ok_or("explicit cutoff required")?.parse::<i64>().map_err(|_|"invalid cutoff")?;
    if end<=start||end>day_end||end>Utc::now().timestamp_millis(){return Err("out of authorized scope".into())}
    let runtime=tokio::runtime::Builder::new_current_thread().enable_all().build().map_err(|_|"runtime failed")?;
    let begin=std::time::Instant::now();
    let r=runtime.block_on(Provider::new()?.period_scoped(&[start,end],true,false))?;
    let elapsed=begin.elapsed().as_micros();
    let sum:i64=r.apps.iter().map(|x|x.ms).sum();
    let timeline:i64=r.timeline.iter().map(|x|x.end-x.start).sum();
    if sum!=r.active_ms||timeline!=sum||r.active_ms>r.known_ms||r.known_ms>end-start||r.website_available||!r.websites.is_empty()||!r.website_timeline.is_empty(){return Err("aggregate invariant failed".into())}
    println!("{}",serde_json::json!({"range_ms":end-start,"known_ms":r.known_ms,"active_ms":r.active_ms,"known_afk_ms":r.known_ms-r.active_ms,"unknown_ms":end-start-r.known_ms,"app_count":r.apps.len(),"timeline_count":r.timeline.len(),"elapsed_us":elapsed,"website_requested":false,"aggregate_invariants":true}));
    Ok(())
}
fn main(){if let Err(e)=run(){eprintln!("Audit stopped: {e}");std::process::exit(1)}}
