// Bounded isolated pipe consumer. No native commands registered in TODO.
use std::{io::{self,BufRead,Read},path::Path};
use todo_activity_core::{collector::{Collector,Sample},store::Store,Outcome};
fn run()->Result<(),String>{
    let args:Vec<String>=std::env::args().collect();
    if args.len()<3||args[1]!="--isolated"||!Path::new(&args[2]).is_absolute()||args[3..].iter().any(|x|!x.starts_with("org.todo.fixture.")){return Err("isolated invocation required".into())}
    let mut store=Store::open(Path::new(&args[2]))?;
    let mut collector=Collector::new("fixture","app");
    let mut last=None;let mut samples=0;let mut intervals=0;
    let mut input=io::stdin().lock();
    loop {
        let mut line=Vec::new();
        let n=(&mut input).take(4097).read_until(b'\n',&mut line).map_err(|_|"input failed")?;
        if n==0{break}
        if n>4096||samples>=1000||line.last()!=Some(&b'\n'){return Err("input limit".into())}
        let sample:Sample=serde_json::from_slice(&line).map_err(|_|"invalid sample")?;
        let (obs,quality)=sample.observation(&args[3..])?;
        if last.is_none(){collector.start(&store,obs.wall_ms)?}
        last=Some(obs.wall_ms);
        if matches!(collector.observe(&mut store,obs,quality)?,Outcome::Interval(_)){intervals+=1}
        samples+=1;
    }
    if let Some(last)=last{collector.stop(&store,last)?}
    println!("samples={samples} committed_intervals={intervals}");
    Ok(())
}
fn main(){if run().is_err(){eprintln!("native ingest stopped");std::process::exit(1)}}
