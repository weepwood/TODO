// Explicit metadata-only check. Never calls report/events or prints bucket IDs.
fn main() -> Result<(),String> {
    let runtime=tokio::runtime::Builder::new_current_thread().enable_all().build().map_err(|_|"runtime failed")?;
    let status=runtime.block_on(todo_activitywatch::Provider::new()?.status())?;
    println!("{}",serde_json::to_string(&status).map_err(|_|"encode failed")?);
    Ok(())
}
