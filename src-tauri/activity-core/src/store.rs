//! Independent SQLite database. Callers choose an isolated, account-local path.
use crate::Interval;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Quality { Sampled, Event, Unknown, Browser }
impl Quality { fn label(self)->&'static str {match self {Self::Sampled=>"sampled",Self::Event=>"event",Self::Unknown=>"unknown",Self::Browser=>"browser"}} }
use rusqlite::{Connection, OptionalExtension, TransactionBehavior, params};
use std::{path::Path, time::Duration};

pub struct Store { conn: Connection }
impl Store {
    pub fn open(path: &Path) -> Result<Self, String> {
        let mut conn = Connection::open(path).map_err(err)?;
        conn.busy_timeout(Duration::from_secs(2)).map_err(err)?;
        const APP_ID: i64 = 0x54414354; // TACT
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate).map_err(err)?;
        let id:i64 = tx.query_row("PRAGMA application_id",[],|r|r.get(0)).map_err(err)?;
        let version:i64 = tx.query_row("PRAGMA user_version",[],|r|r.get(0)).map_err(err)?;
        let objects:i64 = tx.query_row("SELECT count(*) FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'",[],|r|r.get(0)).map_err(err)?;
        if id==0 && version==0 && objects==0 {
            tx.execute_batch("PRAGMA application_id=1413563220; PRAGMA user_version=1;").map_err(err)?;
        } else if id!=APP_ID || !matches!(version,1|2) {
            return Err("not an activity database or unsupported schema version".into());
        }
        tx.execute_batch("
            CREATE TABLE IF NOT EXISTS activity_sessions(
                device TEXT NOT NULL,
                stream TEXT NOT NULL,
                start_ms INTEGER NOT NULL CHECK(start_ms>=0),
                end_ms INTEGER NOT NULL CHECK(end_ms>start_ms),
                state TEXT NOT NULL CHECK(state IN ('active','idle','locked','suspended','unknown','disabled','excluded')),
                subject TEXT NOT NULL,
                CHECK((state='active' AND length(subject)>0) OR (state!='active' AND subject='')),
                PRIMARY KEY(device,stream,start_ms)
            ) WITHOUT ROWID;
            CREATE INDEX IF NOT EXISTS activity_end ON activity_sessions(device,stream,end_ms);
        ").map_err(err)?;
        if version < 2 {
            tx.execute_batch("ALTER TABLE activity_sessions ADD COLUMN quality TEXT NOT NULL DEFAULT 'sampled' CHECK(quality IN ('sampled','event','unknown','browser')); PRAGMA user_version=2;").map_err(err)?;
        }
        tx.execute_batch("CREATE TABLE IF NOT EXISTS retention_floor(device TEXT NOT NULL,stream TEXT NOT NULL,before_ms INTEGER NOT NULL,PRIMARY KEY(device,stream)) WITHOUT ROWID;
            CREATE TABLE IF NOT EXISTS diagnostics(device TEXT NOT NULL,stream TEXT NOT NULL,at_ms INTEGER NOT NULL,kind TEXT NOT NULL,PRIMARY KEY(device,stream,at_ms,kind)) WITHOUT ROWID;
            CREATE TABLE IF NOT EXISTS outbound(id INTEGER PRIMARY KEY AUTOINCREMENT,body BLOB NOT NULL CHECK(length(body)<=65536));").map_err(err)?;
        tx.commit().map_err(err)?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;").map_err(err)?;
        Ok(Self {conn})
    }
    pub fn watermark(&self, device: &str, stream: &str) -> Result<i64, String> {
        self.conn.query_row("SELECT MAX(COALESCE((SELECT MAX(end_ms) FROM activity_sessions WHERE device=?1 AND stream=?2),0),COALESCE((SELECT before_ms FROM retention_floor WHERE device=?1 AND stream=?2),0))",
            params![device,stream], |r|r.get(0)).map_err(err)
    }
    // Exact retry is a no-op, conflicting replay and overlapping intervals
    // reject the entire batch. IMMEDIATE serializes competing writers.
    pub fn append(&mut self, device: &str, stream: &str, batch: &[Interval]) -> Result<usize,String> {
        self.append_quality(device,stream,batch,Quality::Sampled)
    }
    pub fn append_quality(&mut self, device: &str, stream: &str, batch: &[Interval], quality: Quality) -> Result<usize,String> {
        if !valid_id(device) || !valid_id(stream) || batch.len()>10_000 {
            return Err("invalid stream identity or batch".into());
        }
        if batch.iter().any(|i| !i.valid()) { return Err("invalid interval".into()); }
        let tx = self.conn.transaction_with_behavior(TransactionBehavior::Immediate).map_err(err)?;
        let floor:i64=tx.query_row("SELECT COALESCE((SELECT before_ms FROM retention_floor WHERE device=?1 AND stream=?2),0)",params![device,stream],|r|r.get(0)).map_err(err)?;
        let mut inserted=0;
        for i in batch {
            if i.start_ms<floor {return Err("expired interval".into())}
            let (state,subject)=i.state.parts();
            let quality=if state=="unknown"{Quality::Unknown}else{quality};
            let existing: Option<(i64,String,String,String)> = tx.query_row(
                "SELECT end_ms,state,subject,quality FROM activity_sessions WHERE device=?1 AND stream=?2 AND start_ms=?3",
                params![device,stream,i.start_ms],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))).optional().map_err(err)?;
            if let Some((end,s,k,q))=existing {
                if end==i.end_ms && s==state && k==subject && q==quality.label() { continue; }
                return Err("conflicting replay".into());
            }
            let predecessor:Option<i64>=tx.query_row(
                "SELECT end_ms FROM activity_sessions WHERE device=?1 AND stream=?2 AND start_ms<?3 ORDER BY start_ms DESC LIMIT 1",
                params![device,stream,i.end_ms],|r|r.get(0)).optional().map_err(err)?;
            if predecessor.is_some_and(|end|end>i.start_ms) { return Err("overlapping interval".into()); }
            inserted+=tx.execute("INSERT INTO activity_sessions(device,stream,start_ms,end_ms,state,subject,quality) VALUES(?1,?2,?3,?4,?5,?6,?7)",
                params![device,stream,i.start_ms,i.end_ms,state,subject,quality.label()]).map_err(err)?;
        }
        tx.commit().map_err(err)?;
        Ok(inserted)
    }
    pub fn diagnostic(&self,device:&str,stream:&str,at:i64,kind:&str)->Result<(),String>{
        if !valid_id(device)||!valid_id(stream)||at<0||!matches!(kind,"clock"|"start"|"pause"|"stop"|"resume"|"gap"){return Err("invalid diagnostic".into())}
        self.conn.execute("INSERT OR IGNORE INTO diagnostics VALUES(?1,?2,?3,?4)",params![device,stream,at,kind]).map_err(err)?;
        Ok(())
    }
    pub fn coverage(&self,device:&str,stream:&str,from:i64,to:i64)->Result<(i64,i64,i64),String>{
        let totals=self.totals(device,stream,from,to)?;
        let recorded:i64=totals.iter().map(|r|r.2).sum();
        let known:i64=totals.iter().filter(|r|r.0!="unknown"&&r.0!="disabled").map(|r|r.2).sum();
        Ok((known,recorded,to-from))
    }
    // Drop only whole expired intervals. Keep a straddling interval unchanged
    // so an exact retry cannot recreate purged rows or conflict at its edge.
    pub fn retain_since(&mut self,device:&str,stream:&str,cutoff:i64)->Result<usize,String>{
        if !valid_id(device)||!valid_id(stream)||cutoff<0{return Err("invalid retention".into())}
        let tx=self.conn.transaction_with_behavior(TransactionBehavior::Immediate).map_err(err)?;
        let floor:i64=tx.query_row("SELECT COALESCE((SELECT MIN(start_ms) FROM activity_sessions WHERE device=?1 AND stream=?2 AND start_ms<?3 AND end_ms>?3),?3)",params![device,stream,cutoff],|r|r.get(0)).map_err(err)?;
        tx.execute("INSERT INTO retention_floor VALUES(?1,?2,?3) ON CONFLICT(device,stream) DO UPDATE SET before_ms=MAX(before_ms,excluded.before_ms)",params![device,stream,floor]).map_err(err)?;
        let n=tx.execute("DELETE FROM activity_sessions WHERE device=?1 AND stream=?2 AND end_ms<=?3",params![device,stream,cutoff]).map_err(err)?;
        tx.execute("DELETE FROM diagnostics WHERE device=?1 AND stream=?2 AND at_ms<?3",params![device,stream,cutoff]).map_err(err)?;
        tx.commit().map_err(err)?;
        Ok(n)
    }
    pub(crate) fn enqueue(&mut self,body:&[u8],limit:usize)->Result<i64,String>{
        if body.len()>65536||limit==0||limit>1024{return Err("invalid queue limits".into())}
        let tx=self.conn.transaction_with_behavior(TransactionBehavior::Immediate).map_err(err)?;
        let n:i64=tx.query_row("SELECT count(*) FROM outbound",[],|r|r.get(0)).map_err(err)?;
        if n>=limit as i64{return Err("queue full".into())}
        tx.execute("INSERT INTO outbound(body) VALUES(?1)",[body]).map_err(err)?;
        let id=tx.last_insert_rowid();tx.commit().map_err(err)?;Ok(id)
    }
    pub(crate) fn peek(&self)->Result<Option<(i64,Vec<u8>)>,String>{
        self.conn.query_row("SELECT id,body FROM outbound ORDER BY id LIMIT 1",[],|r|Ok((r.get(0)?,r.get(1)?))).optional().map_err(err)
    }
    pub(crate) fn ack(&mut self,id:i64)->Result<bool,String>{
        Ok(self.conn.execute("DELETE FROM outbound WHERE id=?1 AND id=(SELECT MIN(id) FROM outbound)",[id]).map_err(err)?==1)
    }
    // Caller supplies UTC bounds of the desired local day (including DST).
    // Unknown and excluded are distinct, never counted as active.
    pub fn totals(&self, device:&str, stream:&str, from:i64,to:i64) -> Result<Vec<(String,String,i64)>,String> {
        if from<0 || to<=from { return Err("invalid bounds".into()); }
        let mut stmt=self.conn.prepare("SELECT state,subject,SUM(MIN(end_ms,?4)-MAX(start_ms,?3))
            FROM activity_sessions WHERE device=?1 AND stream=?2 AND start_ms<?4 AND end_ms>?3
            GROUP BY state,subject ORDER BY state,subject").map_err(err)?;
        let rows=stmt.query_map(params![device,stream,from,to],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).map_err(err)?;
        rows.collect::<Result<Vec<_>,_>>().map_err(err)
    }
}
fn valid_id(s:&str)->bool {
    !s.is_empty() && s.len()<=128 && s.bytes().all(|b| b.is_ascii_alphanumeric() || b".-_".contains(&b))
}
fn err(e:rusqlite::Error)->String { e.to_string() }
