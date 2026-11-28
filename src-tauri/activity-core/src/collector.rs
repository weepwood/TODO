//! Explicit lifecycle, default off. Persist before advancing in-memory state.
use crate::{Engine,Observation,Outcome,State,store::{Quality,Store}};
use serde::Deserialize;

#[derive(Debug,Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Sample {
    pub wall_ms:i64,
    pub monotonic_ms:u64,
    pub state:String,
    pub subject:Option<String>,
    pub reason:String,
}
impl Sample {
    pub fn observation(self,allowed:&[String])->Result<(Observation,Quality),String>{
        let quality=match self.reason.as_str(){"poll"=>Quality::Sampled,"event"=>Quality::Event,_=>return Err("invalid reason".into())};
        let state=match (self.state.as_str(),self.subject){
            ("active",Some(id)) if allowed.contains(&id) => State::Active(id),
            ("active",Some(_)) => State::Excluded,
            ("idle",None)=>State::Idle,
            ("locked",None)=>State::Locked,
            ("suspended",None)=>State::Suspended,
            ("excluded",None)=>State::Excluded,
            ("unknown",None)=>State::Unknown,
            _=>return Err("invalid sample".into())
        };
        Ok((Observation{wall_ms:self.wall_ms,monotonic_ms:self.monotonic_ms,state},quality))
    }
}
#[derive(Debug,Clone,Copy,PartialEq,Eq)]
pub enum Mode { Off, Running, Paused }
pub struct Collector {
    pub mode:Mode,
    engine:Engine,
    last_quality:Quality,
    device:String,
    stream:String,
}
impl Collector {
    pub fn new(device:&str,stream:&str)->Self{
        Self{mode:Mode::Off,engine:Engine::new(10_000,250),last_quality:Quality::Unknown,device:device.into(),stream:stream.into()}
    }
    pub fn start(&mut self,store:&Store,at:i64)->Result<(),String>{
        if self.mode==Mode::Running{return Err("already running".into())}
        store.diagnostic(&self.device,&self.stream,at,if self.mode==Mode::Paused{"resume"}else{"start"})?;
        self.engine=Engine::new(10_000,250).with_watermark(store.watermark(&self.device,&self.stream)?);
        self.last_quality=Quality::Unknown;self.mode=Mode::Running;Ok(())
    }
    pub fn observe(&mut self,store:&mut Store,obs:Observation,quality:Quality)->Result<Outcome,String>{
        if self.mode!=Mode::Running{return Err("collector disabled".into())}
        let mut next=self.engine.clone();
        let at=obs.wall_ms;
        let result=next.observe(obs);
        match &result {
            Outcome::Interval(i)=>{store.append_quality(&self.device,&self.stream,std::slice::from_ref(i),if self.last_quality==Quality::Event&&quality==Quality::Event{Quality::Event}else{Quality::Sampled})?;},
            Outcome::ClockDiscontinuity=>store.diagnostic(&self.device,&self.stream,at,"clock")?,
            Outcome::Rejected=>return Err("invalid observation".into()),
            Outcome::Anchor=>{}
        }
        self.engine=next;self.last_quality=quality;Ok(result)
    }
    pub fn pause(&mut self,store:&Store,at:i64)->Result<(),String>{
        if self.mode!=Mode::Running{return Err("not running".into())}
        store.diagnostic(&self.device,&self.stream,at,"pause")?;
        self.mode=Mode::Paused;Ok(())
    }
    pub fn stop(&mut self,store:&Store,at:i64)->Result<(),String>{
        if self.mode==Mode::Off{return Ok(())}
        store.diagnostic(&self.device,&self.stream,at,"stop")?;
        self.mode=Mode::Off;Ok(())
    }
}
