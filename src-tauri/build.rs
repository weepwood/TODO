fn main() {
  tauri_build::try_build(tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&[
    "native_take_quick_capture",
    "native_shortcut_status",
    "native_open_capture",
    "native_capture_generation",
    "native_capture_handoff",
    "native_capture_cancel",
    "native_list_backups",
    "native_read_backup",
    "native_create_backup",
    "native_load",
    "native_save",
    "native_load_store",
    "native_write_store",
    "native_activate",
    "native_search",
    "native_notify",
    "native_exit",
    "native_test_notification",
  ]))).expect("application build");
}
