// Android-only plugin. Mobile command dispatch is handled by Tauri.
use tauri::{Runtime,plugin::{Builder,TauriPlugin}};
pub fn init<R:Runtime>() -> TauriPlugin<R>{
 Builder::new("todo-mobile").setup(|_,api|{
  #[cfg(target_os="android")]
  {api.register_android_plugin("com.weepwood.todo.mobile","TodoMobilePlugin")?;}
  Ok(())
 }).build()
}
