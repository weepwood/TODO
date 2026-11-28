//! Chromium native messaging transport prototype. Browser manifest allowlist
//! is the security boundary; argv alone cannot authenticate same-user processes.
use crate::{Interval,State,store::{Store,Quality}};
use serde::{Deserialize,Serialize};
use std::io::{Read,Write};

pub const MAX_FRAME:usize=65536;
#[derive(Debug,Serialize,Deserialize,PartialEq,Eq)]
#[serde(deny_unknown_fields)]
pub struct Batch {pub version:u32,pub spans:Vec<WebSpan>}
#[derive(Debug,Serialize,Deserialize,PartialEq,Eq)]
#[serde(deny_unknown_fields)]
pub struct WebSpan {pub start_ms:i64,pub end_ms:i64,pub domain:String,pub private:bool}
fn domain_valid(s:&str)->bool{
    s.len()<=253&&s.contains('.')&&s.split('.').all(|p|!p.is_empty()&&p.len()<=63&&
        !p.starts_with('-')&&!p.ends_with('-')&&p.bytes().all(|b|b.is_ascii_lowercase()||b.is_ascii_digit()||b==b'-'))
        &&s.rsplit('.').next().is_some_and(|p|p.bytes().any(|b|b.is_ascii_lowercase()))
}
impl Batch {
    pub fn intervals(&self)->Result<Vec<Interval>,String>{
        if self.version!=1||self.spans.is_empty()||self.spans.len()>256{return Err("invalid batch".into())}
        let mut out=Vec::new();
        for s in &self.spans {
            // No URL, query, title, IP address or single-label local hostname.
            if s.private||!domain_valid(&s.domain)||s.start_ms<0||s.end_ms<=s.start_ms||s.end_ms-s.start_ms>3_600_000{return Err("invalid span".into())}
            out.push(Interval{start_ms:s.start_ms,end_ms:s.end_ms,state:State::Active(s.domain.clone())});
        }
        if out.windows(2).any(|p|p[0].end_ms>p[1].start_ms){return Err("overlapping or unordered batch".into())}
        Ok(out)
    }
}
pub fn origin_allowed(origin:&str,expected_id:&str)->bool{
    expected_id.len()==32&&expected_id.bytes().all(|b|(b'a'..=b'p').contains(&b))&&origin==format!("chrome-extension://{expected_id}/")
}
pub fn read_frame(r:&mut impl Read)->Result<Option<Vec<u8>>,String>{
    let mut len=[0u8;4];
    loop { match r.read(&mut len[..1]) {
        Ok(0)=>return Ok(None),Ok(1)=>break,Ok(_)=>unreachable!(),Err(e) if e.kind()==std::io::ErrorKind::Interrupted=>continue,Err(e)=>return Err(e.to_string())
    }}
    r.read_exact(&mut len[1..]).map_err(|e|e.to_string())?;
    let n=u32::from_ne_bytes(len) as usize;
    if n==0||n>MAX_FRAME{return Err("invalid frame length".into())}
    let mut body=vec![0;n];r.read_exact(&mut body).map_err(|e|e.to_string())?;Ok(Some(body))
}
pub fn write_frame(w:&mut impl Write,body:&[u8])->Result<(),String>{
    if body.is_empty()||body.len()>MAX_FRAME{return Err("invalid frame length".into())}
    w.write_all(&(body.len() as u32).to_ne_bytes()).and_then(|_|w.write_all(body)).and_then(|_|w.flush()).map_err(|e|e.to_string())
}
pub fn receive(store:&mut Store,device:&str,stream:&str,body:&[u8],allowed:&[String])->Result<usize,String>{
    if body.len()>MAX_FRAME{return Err("oversized batch".into())}
    let batch:Batch=serde_json::from_slice(body).map_err(|_|"invalid JSON".to_string())?;
    let spans=batch.intervals()?;
    // Explicit host allowlist; no data is committed if any domain is unapproved.
    if batch.spans.iter().any(|s|!allowed.contains(&s.domain)){return Err("domain excluded".into())}
    store.append_quality(device,stream,&spans,Quality::Browser)
}
// Sender-side durable FIFO prototype, separate database from receiving host.
pub struct Queue<'a>{store:&'a mut Store,limit:usize}
impl<'a> Queue<'a>{
    pub fn new(store:&'a mut Store,limit:usize)->Self{Self{store,limit}}
    pub fn push(&mut self,batch:&Batch,allowed:&[String])->Result<i64,String>{
        batch.intervals()?;
        if batch.spans.iter().any(|s|!allowed.contains(&s.domain)){return Err("domain excluded".into())}
        self.store.enqueue(&serde_json::to_vec(batch).map_err(|_|"encode failed")?,self.limit)
    }
    pub fn front(&self)->Result<Option<(i64,Vec<u8>)>,String>{self.store.peek()}
    pub fn acknowledge(&mut self,id:i64)->Result<bool,String>{self.store.ack(id)}
}
