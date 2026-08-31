mod external;
mod fs;
mod icons;
mod notes;
mod shell;
mod shellnew;
mod transfer;
mod workspaces;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // A second launch (BlueWind's "フォルダを開くファイラー" setting,
        // Win+R, FlexFind's "FlexExplorerで表示", …) hands its argv to this
        // already-running instance instead of spawning a new process/window.
        // We surface the requested folder to the frontend as an event; it
        // opens a fresh pane in the "tmp" layout group (creating that group
        // if needed) rather than disturbing whatever the user already has open.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            use tauri::{Emitter, Manager};
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
            if let Some(target) = argv.get(1).and_then(|raw| fs::resolve_launch_target(raw)) {
                let _ = app.emit("open-in-tmp-pane", target);
            }
        }))
        // Backs the user-configurable global hotkey (default Ctrl+Alt+O) that
        // pops FlexExplorer's own quick-path prompt — registration itself is
        // driven from the frontend (see fs/bridge.ts registerGlobalShortcut),
        // this just wires up the plugin runtime.
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        // Dragging files out to Explorer/other apps. Safe to add alongside the
        // in-app HTML5 drag-and-drop: this is a drag *source* (DoDragDrop from
        // our own process) and doesn't touch the webview's drop target, which
        // is what `dragDropEnabled: true` would have hijacked.
        .plugin(tauri_plugin_drag::init())
        .invoke_handler(tauri::generate_handler![
            fs::list_dir,
            fs::list_drives,
            fs::home_dir,
            fs::launch_path,
            fs::open_path,
            fs::read_text_preview,
            fs::read_xlsx_preview,
            fs::sibling_folders,
            fs::resolve_target,
            transfer::plan_transfer,
            transfer::start_transfer,
            transfer::cancel_transfer,
            fs::rename_path,
            fs::copy_entries,
            fs::move_entries,
            fs::delete_entries,
            fs::create_folder,
            fs::create_new_item,
            fs::search_dir,
            icons::shell_icon,
            icons::shell_icon_for_path,
            shell::shell_verb,
            shell::resolve_shortcut,
            shell::create_shortcut,
            shell::create_path_shortcut_text,
            shell::duplicate_as_dated_copy,
            shell::reveal_in_explorer,
            shell::open_in_terminal,
            shell::open_in_vscode,
            shell::show_shell_context_menu,
            notes::notes_load,
            notes::notes_set,
            notes::notes_delete,
            external::external_tools_status,
            external::tortoise_svn_command,
            external::winmerge_compare,
            workspaces::save_workspace,
            workspaces::list_workspaces,
            workspaces::load_workspace,
            workspaces::delete_workspace,
        ])
        .run(tauri::generate_context!())
        .expect("error while running FlexExplorer");
}
