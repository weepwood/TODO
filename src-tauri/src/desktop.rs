//! Desktop-only window lifecycle, tray and global shortcuts.
use super::*;
use tauri::{WindowEvent,menu::{Menu,MenuItem},tray::TrayIconBuilder};
use tauri_plugin_global_shortcut::{GlobalShortcutExt,ShortcutState};
pub(super) fn reset_capture_window(app:&tauri::AppHandle){if let Some(w)=app.get_webview_window("capture"){let _=w.hide();let _=app.emit_to("capture","todo-capture-reset",());}}
pub(super) fn request_quick_capture(app:&tauri::AppHandle){
 let active=app.state::<ActiveScope>();let capture=app.state::<QuickCapture>();
 let decision=if let (Ok(current),Ok(mut state))=(active.0.lock(),capture.0.lock()){
  if let Some(scope)=current.as_deref(){if let Some(d)=state.direct.as_mut(){if let Ok(c)=app.state::<Database>().0.lock(){d.saved=matches!(direct_status(&c,&d.scope,&d.id).ok().flatten().as_deref(),Some("saved"|"cancelled"));}}if state.pending.is_none(){let reset=state.scope.as_deref()!=Some(scope)||state.direct.as_ref().is_some_and(|d|d.saved);if reset{state.begin(scope);if let Ok(c)=app.state::<Database>().0.lock(){if let Ok(Some(mut d))=pending_direct(&c,scope){d.generation=state.generation;state.direct=Some(d);}}}Some(reset)}else{None}}else{None}
 }else{None};
 let opened=if let (Some(reset),Some(w))=(decision,app.get_webview_window("capture")){
  if reset{let _=app.emit_to("capture","todo-capture-reset",());}
  w.show().and_then(|_|w.unminimize()).and_then(|_|w.set_focus()).is_ok()
 }else{false};
 if !opened{if let Ok(mut state)=capture.0.lock(){state.open_main=true;}show(app);let _=app.emit_to("main","todo-quick-add",());}
}
#[derive(serde::Serialize,serde::Deserialize)]
struct WindowGeometry { width:u32,height:u32,maximized:bool }
fn geometry_path(app:&tauri::AppHandle)->Option<std::path::PathBuf>{app.path().app_data_dir().ok().map(|p|p.join("window-state.json"))}
pub(super) fn save_window(w:&tauri::WebviewWindow){
 let Some(path)=geometry_path(w.app_handle())else{return};
 let Ok(maximized)=w.is_maximized()else{return};
 if maximized{
  if let Ok(raw)=std::fs::read(&path){if let Ok(mut g)=serde_json::from_slice::<WindowGeometry>(&raw){g.maximized=true;let _=write_geometry(&path,&g);return}}
 }
 let (Ok(size),Ok(scale))=(w.inner_size(),w.scale_factor())else{return};let logical=size.to_logical::<f64>(scale);
 let g=WindowGeometry{width:logical.width.round().clamp(760.,3840.) as u32,height:logical.height.round().clamp(520.,2160.) as u32,maximized};
 let _=write_geometry(&path,&g);
}
fn write_geometry(path:&std::path::Path,g:&WindowGeometry)->Result<(),String>{
 let tmp=path.with_extension("tmp");std::fs::write(&tmp,serde_json::to_vec(g).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
 std::fs::rename(tmp,path).map_err(|e|e.to_string())
}
fn restore_window(w:&tauri::WebviewWindow){
 let Some(path)=geometry_path(w.app_handle())else{return};let Ok(raw)=std::fs::read(path)else{return};
 let Ok(g)=serde_json::from_slice::<WindowGeometry>(&raw)else{return};
 let (mut width,mut height)=(g.width.clamp(760,3840),g.height.clamp(520,2160));
 if let Ok(Some(m))=w.current_monitor(){let scale=m.scale_factor();let limit=m.size().to_logical::<f64>(scale);width=width.min((limit.width-40.).max(760.) as u32);height=height.min((limit.height-100.).max(520.) as u32);}
 let _=w.set_size(tauri::LogicalSize::new(width,height));let _=w.center();if g.maximized{let _=w.maximize();}
}
pub(super) fn show(app:&tauri::AppHandle){if let Some(w)=app.get_webview_window("main"){let _=w.show();let _=w.unminimize();let _=w.set_focus();}}
pub(super) fn setup(app:&mut tauri::App)->Result<(),Box<dyn std::error::Error>>{
  let open=MenuItem::with_id(app,"open","打开 TODO",true,None::<&str>)?;let quit=MenuItem::with_id(app,"quit","退出 TODO",true,None::<&str>)?;
  let quick=MenuItem::with_id(app,"quick","快速新建任务",true,None::<&str>)?;let hide=MenuItem::with_id(app,"hide","隐藏主窗口",true,None::<&str>)?;let menu=Menu::with_items(app,&[&open,&quick,&hide,&quit])?;
  let mut tray=TrayIconBuilder::new().menu(&menu).tooltip("TODO").on_menu_event(|app,event|match event.id.as_ref(){"open"=>show(app),"quick"=>request_quick_capture(app),"hide"=>{if let Some(w)=app.get_webview_window("main"){save_window(&w);let _=app.emit_to("main","todo-native-pause",());let _=w.hide();}},"quit"=>{let active=app.state::<ActiveScope>();if active.0.lock().ok().and_then(|s|s.clone()).is_some(){let _=app.emit("todo-quit-request",());}else{app.exit(0)}},_=>{}});
  if let Some(icon)=app.default_window_icon(){tray=tray.icon(icon.clone())}tray.build(app)?;
  if app.config().identifier == "com.weepwood.todo" {
   let status=match app.global_shortcut().register("CommandOrControl+Shift+A"){Ok(())=>"registered",Err(e)=>{eprintln!("global shortcut unavailable: {e}");"unavailable"}};
   if let Ok(mut value)=app.state::<ShortcutStatus>().0.lock(){*value=status.into()}
  }
  if let Some(w)=app.get_webview_window("main"){restore_window(&w);}Ok(())
}
pub(super) fn configure(builder:tauri::Builder<tauri::Wry>)->tauri::Builder<tauri::Wry>{
 builder.plugin(tauri_plugin_single_instance::init(|app,_,_|show(app)))
 .plugin(tauri_plugin_global_shortcut::Builder::new().with_handler(|app,_,event|{if event.state()==ShortcutState::Pressed{request_quick_capture(app);}}).build())
 .on_window_event(|window,event|{if let WindowEvent::CloseRequested{api,..}=event{api.prevent_close();if window.label()=="capture"{let app=window.app_handle();if let Ok(mut state)=app.state::<QuickCapture>().0.lock(){if !state.direct.as_ref().is_some_and(|d|!d.saved){state.invalidate();}}if let Some(w)=app.get_webview_window("capture"){let _=w.hide();}}else if window.label()=="main"{if let Some(w)=window.app_handle().get_webview_window("main"){save_window(&w);}let _=window.app_handle().emit_to("main","todo-native-pause",());let _=window.hide();}}})
}
