// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  #[cfg(not(any(target_os = "android", target_os = "ios")))]
  if std::env::args().nth(1).as_deref()==Some("--cli") { std::process::exit(app_lib::cli::main_cli()); }
  app_lib::run();
}
