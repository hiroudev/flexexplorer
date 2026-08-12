mod fs;
mod icons;
mod shell;
mod workspaces;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            fs::list_dir,
            fs::list_drives,
            fs::home_dir,
            fs::open_path,
            fs::read_text_preview,
            fs::read_xlsx_preview,
            fs::rename_path,
            fs::copy_entries,
            fs::move_entries,
            fs::delete_entries,
            fs::create_folder,
            fs::search_dir,
            icons::shell_icon,
            icons::shell_icon_for_path,
            shell::shell_verb,
            shell::create_shortcut,
            shell::reveal_in_explorer,
            shell::open_in_terminal,
            shell::open_in_vscode,
            workspaces::save_workspace,
            workspaces::list_workspaces,
            workspaces::load_workspace,
            workspaces::delete_workspace,
        ])
        .run(tauri::generate_context!())
        .expect("error while running FlexExplorer");
}
