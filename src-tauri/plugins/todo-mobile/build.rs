fn main(){
 tauri_plugin::Builder::new(&["session_read","session_write","session_remove","revision_configure","revision_status","revision_cancel","update_prepare","update_status","update_install","update_confirm","update_cancel"])
 .android_path("android").try_build().expect("TODO mobile plugin");
}
