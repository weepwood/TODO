//! Read-only, single-host ActivityWatch adapter. No collector, cache or database.
use chrono::{DateTime, Utc};
use reqwest::{Client, Url};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use std::{collections::{BTreeMap, BTreeSet}, time::Duration};

const BASE: &str = "http://127.0.0.1:5600/api/0/";
const LIMIT: usize = 20_000;
const MAX_BYTES: usize = 8 * 1024 * 1024;
const MAX_DAY: i64 = 26 * 60 * 60 * 1000;

#[derive(Debug, Clone, Deserialize)]
struct Info { hostname: String, version: String }
#[derive(Debug, Clone, Deserialize)]
struct Bucket { #[serde(rename="type")] kind: String, hostname: String }
#[derive(Debug, Deserialize)]
struct Event { timestamp: DateTime<Utc>, duration: f64, data: EventData }
#[derive(Debug, Deserialize)]
struct EventData {
    app: Option<String>, status: Option<String>, url: Option<String>,
    #[serde(default)] incognito: bool,
    #[serde(default)] private: bool,
}
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct Span { pub start: i64, pub end: i64, pub subject: String }
#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct Total { pub subject: String, pub ms: i64 }
#[derive(Debug, Serialize)]
pub struct Status { pub version: String, pub app: bool, pub afk: bool, pub browsers: usize }
#[derive(Debug, Serialize)]
pub struct Report {
    pub start: i64, pub end: i64, pub known_ms: i64, pub active_ms: i64,
    pub website_ms: i64, pub website_available: bool, pub apps: Vec<Total>, pub websites: Vec<Total>,
    pub timeline: Vec<Span>, pub warnings: Vec<String>,
}

pub struct Provider { client: Client, base: Url }
impl Provider {
    pub fn new() -> Result<Self, String> { Self::at(BASE) }
    fn at(base: &str) -> Result<Self,String> {
        let client = Client::builder().no_proxy().redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(2)).timeout(Duration::from_secs(5))
            .build().map_err(|_| "连接初始化失败".to_owned())?;
        Ok(Self {client,base:Url::parse(base).map_err(|_| "地址错误".to_owned())?})
    }
    async fn get<T:DeserializeOwned>(&self, path:&[&str], params:&[(&str,String)]) -> Result<T,String> {
        let mut url=self.base.clone();
        {let mut p=url.path_segments_mut().map_err(|_|"地址错误")?;p.pop_if_empty();for s in path {p.push(s);}}
        if !params.is_empty(){let mut q=url.query_pairs_mut();for (k,v) in params{q.append_pair(k,v);}}
        let mut res=self.client.get(url).send().await.map_err(|_|"ActivityWatch 未运行或连接超时".to_owned())?;
        if res.status().as_u16()==401||res.status().as_u16()==403{return Err("ActivityWatch 拒绝访问；本版不支持 API 密钥认证".into())}
        if !res.status().is_success(){return Err("ActivityWatch API 响应异常".into())}
        if res.content_length().is_some_and(|n|n>MAX_BYTES as u64){return Err("数据量超过安全上限".into())}
        let mut buf=Vec::new();
        while let Some(chunk)=res.chunk().await.map_err(|_|"数据读取失败")? {
            if buf.len()+chunk.len()>MAX_BYTES{return Err("数据量超过安全上限".into())}
            buf.extend_from_slice(&chunk);
        }
        serde_json::from_slice(&buf).map_err(|_|"ActivityWatch 数据格式不兼容".into())
    }
    async fn sources(&self)->Result<(Info, BTreeMap<String,Bucket>),String>{
        let info:Info=self.get(&["info"],&[]).await?;
        // Explicit supported API family, not a claim of every implementation.
        let version=info.version.trim_start_matches('v');
        if !version.starts_with("0.13.")&&!version.starts_with("0.14.") {return Err("当前仅支持 ActivityWatch 0.13/0.14 API 候选".into())}
        let buckets:BTreeMap<String,Bucket>=self.get(&["buckets",""],&[]).await?;
        Ok((info,buckets))
    }
    pub async fn status(&self)->Result<Status,String>{
        let (info,b)=self.sources().await?;
        let local=b.values().filter(|b|b.hostname==info.hostname);
        Ok(Status{version:info.version,app:local.clone().filter(|b|b.kind=="currentwindow").count()==1,
            afk:local.clone().filter(|b|b.kind=="afkstatus").count()==1,
            browsers:local.filter(|b|b.kind=="web.tab.current").count()})
    }
    async fn events(&self,id:&str,start:i64,end:i64)->Result<Vec<Event>,String>{
        let stamp=|ms|DateTime::<Utc>::from_timestamp_millis(ms).map(|d|d.to_rfc3339()).ok_or("日期无效".to_owned());
        let v:Vec<Event>=self.get(&["buckets",id,"events"],&[("start",stamp(start)?),("end",stamp(end)?),("limit",(LIMIT+1).to_string())]).await?;
        if v.len()>LIMIT{return Err("单日记录超过上限，不能保证完整性".into())}
        Ok(v)
    }
    pub async fn report(&self,start:i64,end:i64)->Result<Report,String>{
        if start<0||end<=start||end-start>MAX_DAY||end>Utc::now().timestamp_millis()+MAX_DAY{return Err("仅支持单个本地日期范围".into())}
        let (info,b)=self.sources().await?;
        let local=b.iter().filter(|(_,x)|x.hostname==info.hostname);
        let one=|kind:&str|->Result<String,String>{
            let ids:Vec<_>=local.clone().filter(|(_,x)|x.kind==kind).map(|(id,_)|id.clone()).collect();
            if ids.len()!=1{return Err("当前设备缺少唯一应用或空闲数据源，请检查 ActivityWatch".into())}
            Ok(ids[0].clone())
        };
        let app=one("currentwindow")?;let afk=one("afkstatus")?;
        let apps=spans(self.events(&app,start,end).await?,start,end,|d|if d.private||d.incognito{None}else{d.app.and_then(clean_app)})?;
        let afk=spans(self.events(&afk,start,end).await?,start,end,|d|d.status.filter(|s|s=="afk"||s=="not-afk"))?;
        let mut warnings=Vec::new();
        let known=intersect(&apps,&afk,|_,_|true,false);
        let active=intersect(&apps,&afk,|_,b|b=="not-afk",false);
        let mut web=Vec::new();
        let mut used=BTreeSet::new();
        let mut candidates:BTreeMap<&str,Vec<&String>>=BTreeMap::new();
        for (id,_) in local.filter(|(_,x)|x.kind=="web.tab.current") {
            if let Some(browser)=browser_bucket(id){candidates.entry(browser).or_default().push(id);}
            else {warnings.push("存在尚未支持的浏览器数据源，未计入网站统计".into());}
        }
        for (browser,ids) in candidates {
            if ids.len()!=1 {warnings.push("存在重复浏览器数据源，已跳过避免重复计时".into());continue}
            let raw=self.events(ids[0],start,end).await?;
            let domains=spans(raw,start,end,|d|if d.private||d.incognito{None}else{d.url.and_then(domain)})?;
            web.extend(intersect(&active,&domains,|a,_|browser_app(a)==Some(browser),true));
            used.insert(browser);
        }
        if used.is_empty(){warnings.push("没有可用的网站数据源；网站时长未知".into())}
        if known.is_empty(){warnings.push("该日期没有应用与空闲状态共同覆盖的记录".into())}
        web.sort_by_key(|s|s.start);
        let active_ms=duration(&active);let website_ms=duration(&web);
        Ok(Report{start,end,known_ms:duration(&known),active_ms,website_ms,website_available:!used.is_empty(),apps:totals(&active),websites:totals(&web),timeline:merge(active),warnings})
    }
}
fn clean_app(s:String)->Option<String>{
    let s=s.trim();
    if s.is_empty()||s.chars().count()>160||s.chars().any(char::is_control)||s.contains(['/', '\\', '?']) {None}else{Some(s.to_owned())}
}
fn domain(s:String)->Option<String>{
    let u=Url::parse(&s).ok()?;
    if !matches!(u.scheme(),"http"|"https")||!u.username().is_empty()||u.password().is_some(){return None}
    let host=u.domain()?.trim_end_matches('.');
    if host.len()>253||!host.contains('.')||host.ends_with(".local")||host.ends_with(".localhost") {return None}
    Some(host.to_owned())
}
fn browser_bucket(id:&str)->Option<&'static str>{
    ["chrome","edge","firefox","brave","chromium","safari"].into_iter().find(|b|id==format!("aw-watcher-web-{b}")||id.starts_with(&format!("aw-watcher-web-{b}_")))
}
fn browser_app(app:&str)->Option<&'static str>{
    match app.to_ascii_lowercase().as_str(){
        "google chrome"|"chrome"|"chrome.exe"|"com.google.chrome"=>Some("chrome"),
        "microsoft edge"|"msedge.exe"|"com.microsoft.edgemac"=>Some("edge"),
        "firefox"|"firefox.exe"|"org.mozilla.firefox"=>Some("firefox"),
        "brave browser"|"brave"|"brave.exe"=>Some("brave"),
        "chromium"=>Some("chromium"),"safari"|"com.apple.safari"=>Some("safari"),_=>None
    }
}
fn spans(events:Vec<Event>,start:i64,end:i64,mut key:impl FnMut(EventData)->Option<String>)->Result<Vec<Span>,String>{
    let mut out=Vec::new();
    for e in events {
        if !e.duration.is_finite()||e.duration<0.0||e.duration>366.0*86400.0{return Err("无效活动时长".into())}
        let t=e.timestamp.timestamp_millis();
        let a=t.max(start);let b=t.saturating_add((e.duration*1000.0).round() as i64).min(end);
        if b>a {out.push(Span{start:a,end:b,subject:key(e.data).unwrap_or_default()});}
    }
    out.sort_by_key(|s|s.start);
    // Do not flood unobserved gaps or resolve contradictory sources arbitrarily.
    let mut result:Vec<Span>=Vec::new();
    for s in out {
        if let Some(prev)=result.last_mut(){
            if s.start<prev.end && s.subject!=prev.subject{return Err("数据源存在重叠冲突，无法可靠统计".into())}
            if s.start<=prev.end && s.subject==prev.subject{prev.end=prev.end.max(s.end);continue}
        }
        result.push(s);
    }
    // Validate excluded intervals before discarding them: a conflicting private
    // or unknown observation must never be counted via an overlapping record.
    result.retain(|s|!s.subject.is_empty());
    Ok(result)
}
fn intersect(a:&[Span],b:&[Span],keep:impl Fn(&str,&str)->bool,second:bool)->Vec<Span>{
    let(mut i,mut j)=(0,0);let mut out=Vec::new();
    while i<a.len()&&j<b.len(){
        let x=&a[i];let y=&b[j];let start=x.start.max(y.start);let end=x.end.min(y.end);
        if start<end&&keep(&x.subject,&y.subject){out.push(Span{start,end,subject:if second{y.subject.clone()}else{x.subject.clone()}});}
        if x.end<=y.end{i+=1}else{j+=1}
    }out
}
fn duration(a:&[Span])->i64{a.iter().map(|s|s.end-s.start).sum()}
fn merge(a:Vec<Span>)->Vec<Span>{
    let mut out:Vec<Span>=Vec::new();
    for s in a{if let Some(p)=out.last_mut(){if p.end==s.start&&p.subject==s.subject{p.end=s.end;continue}}out.push(s)}out
}
fn totals(a:&[Span])->Vec<Total>{
    let mut by=BTreeMap::new();for s in a{*by.entry(s.subject.clone()).or_insert(0)+=s.end-s.start;}
    let mut v:Vec<_>=by.into_iter().map(|(subject,ms)|Total{subject,ms}).collect();
    v.sort_by(|a,b|b.ms.cmp(&a.ms).then(a.subject.cmp(&b.subject)));v
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json,Value};
    use std::{io::{Read,Write},net::TcpListener,thread};
    fn runtime()->tokio::runtime::Runtime{tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap()}
    fn event(t:i64,seconds:i64,data:Value)->Value{
        json!({"timestamp":DateTime::<Utc>::from_timestamp(t,0).unwrap().to_rfc3339(),"duration":seconds,"data":data})
    }
    fn mock(replies:Vec<(&'static str,u16,Value)>)->(Provider,thread::JoinHandle<Vec<String>>){
        let listener=TcpListener::bind("127.0.0.1:0").unwrap();
        let addr=listener.local_addr().unwrap();
        let worker=thread::spawn(move||{
            let mut seen=Vec::new();
            for (expected,status,value) in replies {
                let (mut stream,_)=listener.accept().unwrap();stream.set_read_timeout(Some(Duration::from_secs(3))).unwrap();
                let mut buf=Vec::new();while !buf.ends_with(b"\r\n\r\n"){let mut b=[0;1];stream.read_exact(&mut b).unwrap();buf.push(b[0]);assert!(buf.len()<16384);}
                let text=String::from_utf8(buf).unwrap();let line=text.lines().next().unwrap().to_owned();
                assert!(line.starts_with(&format!("GET /api/0/{expected}")), "{line}");
                assert!(!text.to_ascii_lowercase().contains("authorization:"));
                if expected.ends_with("/events"){assert!(line.contains("limit=20001")&&line.contains("start=")&&line.contains("end="));}
                seen.push(line);
                let body=value.to_string();
                write!(stream,"HTTP/1.1 {status} Test\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\nLocation: http://127.0.0.1:1/forbidden\r\n\r\n{}",body.len(),body).unwrap();
            }seen
        });
        (Provider::at(&format!("http://{addr}/api/0/")).unwrap(),worker)
    }
    fn info()->Value{json!({"hostname":"fixture","version":"0.14.3"})}
    fn buckets()->Value{json!({
        "app":{"type":"currentwindow","hostname":"fixture"},
        "afk":{"type":"afkstatus","hostname":"fixture"},
        "aw-watcher-web-chrome_fixture":{"type":"web.tab.current","hostname":"fixture"},
        "foreign":{"type":"currentwindow","hostname":"other"}
    })}
    #[test]fn read_only_fixture_and_interval_oracle(){
        let (p,h)=mock(vec![("info",200,info()),("buckets/",200,buckets()),
            ("buckets/app/events",200,json!([event(0,20,json!({"app":"Editor","title":"secret-title"})),event(20,40,json!({"app":"Google Chrome"}))])),
            ("buckets/afk/events",200,json!([event(0,10,json!({"status":"not-afk"})),event(10,10,json!({"status":"afk"})),event(20,30,json!({"status":"not-afk"}))])),
            ("buckets/aw-watcher-web-chrome_fixture/events",200,json!([event(20,10,json!({"url":"https://example.org/private?q=secret","title":"secret-title"})),event(30,10,json!({"url":"https://secret.org/","incognito":true})),event(40,20,json!({"url":"https://docs.example.org/"}))]))
        ]);
        let r=runtime().block_on(p.report(0,60_000)).unwrap();
        assert_eq!((r.known_ms,r.active_ms,r.website_ms),(50_000,40_000,20_000));
        assert_eq!(r.timeline.len(),2);assert_eq!(r.websites.len(),2);
        let s=serde_json::to_string(&r).unwrap();assert!(!s.contains("secret")&&!s.contains("https://")&&!s.contains("/private"));
        assert_eq!(h.join().unwrap().len(),5);
    }
    #[test]fn metadata_only_status(){
        let(p,h)=mock(vec![("info",200,info()),("buckets/",200,buckets())]);
        let s=runtime().block_on(p.status()).unwrap();assert!(s.app&&s.afk);assert_eq!(s.browsers,1);
        assert_eq!(h.join().unwrap().len(),2);
    }
    #[test]fn missing_afk_fails_closed(){
        let(p,h)=mock(vec![("info",200,info()),("buckets/",200,json!({"app":{"type":"currentwindow","hostname":"fixture"}}))]);
        assert!(runtime().block_on(p.report(0,60_000)).is_err());h.join().unwrap();
    }
    #[test]fn redirects_and_auth_rejected(){
        for status in [302,401,403,500] {
            let(p,h)=mock(vec![("info",status,json!({"secret":"do not echo"}) )]);
            let e=runtime().block_on(p.status()).unwrap_err();assert!(!e.contains("secret"));h.join().unwrap();
        }
    }
    #[test]fn unsupported_version_stops_before_metadata(){
        let(p,h)=mock(vec![("info",200,json!({"hostname":"fixture","version":"9.0.0"}))]);
        assert!(runtime().block_on(p.status()).is_err());h.join().unwrap();
    }
    #[test]fn overlap_clipping_and_duplicates(){
        let make=|t,d,s|serde_json::from_value(event(t,d,json!({"app":s}))).unwrap();
        let a=spans(vec![make(5,10,"a"),make(5,10,"a"),make(15,5,"a")],10_000,18_000,|d|d.app).unwrap();
        assert_eq!(a,vec![Span{start:10_000,end:18_000,subject:"a".into()}]);
        assert!(spans(vec![make(5,10,"a"),make(7,10,"b")],0,20_000,|d|d.app).is_err());
    }
    #[test]fn excluded_overlapping_observation_is_not_silently_discarded(){
        let events=vec![serde_json::from_value(event(0,20,json!({"url":"https://example.org"}))).unwrap(),
            serde_json::from_value(event(10,10,json!({"url":"https://example.org","private":true}))).unwrap()];
        assert!(spans(events,0,20_000,|d|if d.private{None}else{d.url.and_then(domain)}).is_err());
    }
    #[test]fn domains_and_browser_match(){
        assert_eq!(domain("https://EXAMPLE.org:443/a?q=secret".into()),Some("example.org".into()));
        for s in ["http://127.0.0.1/a","file:///private/a","https://localhost/a","https://user:pw@example.org/a","https://thing.local"]{assert!(domain(s.into()).is_none());}
        assert_eq!(browser_bucket("aw-watcher-web-edge_fixture"),Some("edge"));
        assert_eq!(browser_app("Microsoft Edge"),Some("edge"));
    }
    #[test]fn no_web_is_unknown_not_total(){
        let(p,h)=mock(vec![("info",200,info()),("buckets/",200,json!({"app":{"type":"currentwindow","hostname":"fixture"},"afk":{"type":"afkstatus","hostname":"fixture"}})),
            ("buckets/app/events",200,json!([event(0,60,json!({"app":"Editor"}))])),
            ("buckets/afk/events",200,json!([event(0,60,json!({"status":"not-afk"}))]))]);
        let r=runtime().block_on(p.report(0,60_000)).unwrap();assert!(!r.website_available);assert_eq!(r.active_ms,60_000);h.join().unwrap();
    }
}
