//! Independent SQLite database. Callers choose an isolated, account-local path.
use crate::Interval;
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
        } else if id!=APP_ID || version!=1 {
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
        tx.commit().map_err(err)?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;").map_err(err)?;
        Ok(Self {conn})
    }
    pub fn watermark(&self, device: &str, stream: &str) -> Result<i64, String> {
        self.conn.query_row("SELECT COALESCE(MAX(end_ms),0) FROM activity_sessions WHERE device=?1 AND stream=?2",
            params![device,stream], |r|r.get(0)).map_err(err)
    }
    // Exact retry is a no-op, conflicting replay and overlapping intervals
    // reject the entire batch. IMMEDIATE serializes competing writers.
    pub fn append(&mut self, device: &str, stream: &str, batch: &[Interval]) -> Result<usize,String> {
        if !valid_id(device) || !valid_id(stream) || batch.len()>10_000 {
            return Err("invalid stream identity or batch".into());
        }
        if batch.iter().any(|i| !i.valid()) { return Err("invalid interval".into()); }
        let tx = self.conn.transaction_with_behavior(TransactionBehavior::Immediate).map_err(err)?;
        let mut inserted=0;
        for i in batch {
            let (state,subject)=i.state.parts();
            let existing: Option<(i64,String,String)> = tx.query_row(
                "SELECT end_ms,state,subject FROM activity_sessions WHERE device=?1 AND stream=?2 AND start_ms=?3",
                params![device,stream,i.start_ms],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).optional().map_err(err)?;
            if let Some((end,s,k))=existing {
                if end==i.end_ms && s==state && k==subject { continue; }
                return Err("conflicting replay".into());
            }
            let predecessor:Option<i64>=tx.query_row(
                "SELECT end_ms FROM activity_sessions WHERE device=?1 AND stream=?2 AND start_ms<?3 ORDER BY start_ms DESC LIMIT 1",
                params![device,stream,i.end_ms],|r|r.get(0)).optional().map_err(err)?;
            if predecessor.is_some_and(|end|end>i.start_ms) { return Err("overlapping interval".into()); }
            inserted+=tx.execute("INSERT INTO activity_sessions VALUES(?1,?2,?3,?4,?5,?6)",
                params![device,stream,i.start_ms,i.end_ms,state,subject]).map_err(err)?;
        }
        tx.commit().map_err(err)?;
        Ok(inserted)
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
