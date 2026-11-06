use crate::db::Document;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;
#[tauri::command]
pub async fn export_file(
    app: AppHandle,
    name: String,
    text: String,
) -> Result<Option<String>, String> {
    if text.len() > 16 * 1024 * 1024 {
        return Err("导出内容过大".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let name = name.replace(['/', ':', '\\'], "_");
        let file = app
            .dialog()
            .file()
            .set_file_name(&name)
            .blocking_save_file();
        let Some(file) = file else { return Ok(None) };
        let path = file.into_path().map_err(|_| "无法访问所选路径")?;
        let parent = path.parent().ok_or("无效路径")?;
        let temp = parent.join(format!(".moji-export-{}", uuid::Uuid::new_v4()));
        let result = (|| {
            std::fs::write(&temp, text).map_err(|_| "写入文件失败，请检查目录权限")?;
            std::fs::rename(&temp, &path).map_err(|_| "无法保存到所选文件")?;
            Ok(Some(path.display().to_string()))
        })();
        if temp.exists() {
            let _ = std::fs::remove_file(temp);
        }
        result
    })
    .await
    .map_err(|_| "导出任务异常")?
}
#[tauri::command]
pub async fn import_files(app: AppHandle) -> Result<Vec<Document>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(files) = app
            .dialog()
            .file()
            .add_filter("Markdown 文档", &["md", "markdown", "txt"])
            .blocking_pick_files()
        else {
            return Ok(vec![]);
        };
        let mut docs = vec![];
        for file in files {
            let path = file.into_path().map_err(|_| "无法访问文件")?;
            if std::fs::metadata(&path).map_err(|_| "无法读取文件")?.len() > 8 * 1024 * 1024 {
                return Err("单篇文档不能超过 8 MB".into());
            }
            let text = std::fs::read_to_string(&path).map_err(|_| "文件不是有效的 UTF-8 文本")?;
            docs.push(Document {
                id: uuid::Uuid::new_v4().to_string(),
                name: path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string(),
                text,
            });
        }
        Ok(docs)
    })
    .await
    .map_err(|_| "导入任务异常")?
}
#[tauri::command]
pub fn print_document(window: tauri::WebviewWindow) -> Result<(), String> {
    window.print().map_err(|_| "无法打开系统打印窗口".into())
}
