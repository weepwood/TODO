//! Experimental local-only activity engine. No OS collector or Tauri command
//! is registered by this crate; consumers must explicitly opt in.
pub mod store;
pub mod collector;
pub mod messaging;
use std::collections::BTreeMap;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum State {
    Active(String),
    Idle,
    Locked,
    Suspended,
    Unknown,
    Disabled,
    Excluded,
}
impl State {
    pub fn parts(&self) -> (&str, &str) {
        match self {
            Self::Active(subject) => ("active", subject),
            Self::Idle => ("idle", ""),
            Self::Locked => ("locked", ""),
            Self::Suspended => ("suspended", ""),
            Self::Unknown => ("unknown", ""),
            Self::Disabled => ("disabled", ""),
            Self::Excluded => ("excluded", ""),
        }
    }
    fn valid(&self) -> bool {
        match self {
            // Only opaque app IDs / normalized hostnames, no titles or paths.
            Self::Active(s) => !s.is_empty() && s.len() <= 253 &&
                s.bytes().all(|b| b.is_ascii_alphanumeric() || b".-_".contains(&b)),
            _ => true,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Interval {
    pub start_ms: i64,
    pub end_ms: i64,
    pub state: State,
}
impl Interval {
    pub fn valid(&self) -> bool {
        self.start_ms >= 0 && self.end_ms > self.start_ms && self.state.valid()
    }
    pub fn duration_ms(&self) -> i64 { self.end_ms - self.start_ms }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Observation {
    pub wall_ms: i64,
    pub monotonic_ms: u64,
    pub state: State,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Outcome {
    Anchor,
    Interval(Interval),
    ClockDiscontinuity,
    Rejected,
}

#[derive(Clone)]
pub struct Engine {
    max_gap_ms: u64,
    clock_tolerance_ms: u64,
    previous: Option<Observation>,
    watermark: i64,
    last_monotonic: Option<u64>,
}
impl Engine {
    pub fn new(max_gap_ms: u64, clock_tolerance_ms: u64) -> Self {
        assert!(max_gap_ms > 0);
        Self {max_gap_ms, clock_tolerance_ms, previous: None, watermark: 0, last_monotonic: None}
    }
    // On restart seed the watermark from committed data. Never bridge downtime.
    pub fn with_watermark(mut self, end_ms: i64) -> Self {
        self.watermark = self.watermark.max(end_ms);
        self
    }
    pub fn observe(&mut self, now: Observation) -> Outcome {
        if now.wall_ms < 0 || !now.state.valid() ||
            self.last_monotonic.is_some_and(|t| now.monotonic_ms <= t) {
            return Outcome::Rejected;
        }
        self.last_monotonic = Some(now.monotonic_ms);
        if now.wall_ms < self.watermark {
            self.previous = None;
            return Outcome::ClockDiscontinuity;
        }
        let Some(prev) = self.previous.replace(now.clone()) else {
            self.watermark = self.watermark.max(now.wall_ms);
            return Outcome::Anchor;
        };
        let elapsed = now.monotonic_ms - prev.monotonic_ms;
        let wall = now.wall_ms as i128 - prev.wall_ms as i128;
        self.watermark = self.watermark.max(now.wall_ms);
        // Wall timestamps are the reporting axis; do not manufacture an
        // interval if the two clocks disagree or time is not increasing.
        if wall <= 0 || (wall - elapsed as i128).unsigned_abs() > self.clock_tolerance_ms as u128 {
            return Outcome::ClockDiscontinuity;
        }
        let state = if elapsed > self.max_gap_ms || wall > self.max_gap_ms as i128 {
            State::Unknown
        } else {
            prev.state
        };
        Outcome::Interval(Interval { start_ms: prev.wall_ms, end_ms: now.wall_ms, state })
    }
}

pub fn coalesce(intervals: &[Interval]) -> Result<Vec<Interval>, &'static str> {
    let mut out: Vec<Interval> = Vec::new();
    for i in intervals {
        if !i.valid() { return Err("invalid interval"); }
        if let Some(last) = out.last_mut() {
            if i.start_ms < last.end_ms { return Err("overlap or unordered"); }
            if i.start_ms == last.end_ms && i.state == last.state {
                last.end_ms = i.end_ms;
                continue;
            }
        }
        out.push(i.clone());
    }
    Ok(out)
}

// Both streams are sorted, non-overlapping, and already restricted to one
// device. Website time is a subset of the matching browser's active time.
pub fn website_totals(app: &[Interval], web: &[Interval], browser_id: &str)
    -> Result<BTreeMap<String, i64>, &'static str> {
    let app = coalesce(app)?;
    let web = coalesce(web)?;
    let (mut a, mut b) = (0, 0);
    let mut totals = BTreeMap::<String, i64>::new();
    while a < app.len() && b < web.len() {
        let (x, y) = (&app[a], &web[b]);
        let start = x.start_ms.max(y.start_ms);
        let end = x.end_ms.min(y.end_ms);
        if end > start && matches!(&x.state, State::Active(id) if id == browser_id) {
            if let State::Active(host) = &y.state {
                let total = totals.entry(host.clone()).or_default();
                *total = total.checked_add(end - start).ok_or("overflow")?;
            }
        }
        if x.end_ms <= y.end_ms { a += 1; } else { b += 1; }
    }
    Ok(totals)
}
