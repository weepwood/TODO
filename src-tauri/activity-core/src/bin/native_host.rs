// Isolated protocol harness; NOT installed or registered as a browser host.
// Explicit configuration and origin required. No user profile lookup.
use std::{io,path::Path};
use todo_activity_core::{store::Store,messaging::{origin_allowed,read_frame,write_frame,receive}};
fn run()->Result<(),String>{
    let args:Vec<String>=std::env::args().collect();
    if args.len()!=6||args[1]!="--isolated"||!origin_allowed(&args[5],&args[3]){return Err("host disabled or origin rejected".into())}
    let path=Path::new(&args[2]);
    if !path.is_absolute(){return Err("absolute fixture path required".into())}
    let allowed=vec![args[4].clone()];
    let mut store=Store::open(path)?;
    let mut input=io::stdin().lock();let mut output=io::stdout().lock();
    while let Some(frame)=read_frame(&mut input)? {
        let reply=match receive(&mut store,"fixture","web",&frame,&allowed){
            Ok(n)=>serde_json::json!({"ok":true,"inserted":n}),
            Err(_)=>serde_json::json!({"ok":false,"error":"batch_rejected"})
        };
        write_frame(&mut output,&serde_json::to_vec(&reply).map_err(|_|"encode failed")?)?;
    }
    Ok(())
}
fn main(){if run().is_err(){eprintln!("Native host stopped");std::process::exit(1)}}
