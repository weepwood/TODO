//! Mobile has one WebView; no tray, secondary capture or geometry persistence.
use super::*;
pub(super) fn reset_capture_window(_app:&tauri::AppHandle){}
pub(super) fn request_quick_capture(app:&tauri::AppHandle){
 if let Ok(mut state)=app.state::<QuickCapture>().0.lock(){state.open_main=true;}
 let _=app.emit_to("main","todo-quick-add",());
}
