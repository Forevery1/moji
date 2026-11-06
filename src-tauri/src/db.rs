use crate::AppState;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::Path;
use tauri::State;
#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
pub struct Document {
    pub id: String,
    pub name: String,
    pub text: String,
}
#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
pub struct Workspace {
    pub docs: Vec<Document>,
    pub active: String,
}
pub fn open(path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    conn.busy_timeout(std::time::Duration::from_secs(5))?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY,name TEXT NOT NULL,content TEXT NOT NULL,position INTEGER NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS chats(document_id TEXT PRIMARY KEY,messages TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS revisions(id INTEGER PRIMARY KEY AUTOINCREMENT,document_id TEXT NOT NULL,content TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
PRAGMA user_version=1;")?;
    Ok(conn)
}
pub fn read_workspace(conn: &Connection) -> Result<Option<Workspace>, String> {
    let mut stmt = conn
        .prepare("SELECT id,name,content FROM documents ORDER BY position")
        .map_err(|_| "无法读取文档")?;
    let docs = stmt
        .query_map([], |row| {
            Ok(Document {
                id: row.get(0)?,
                name: row.get(1)?,
                text: row.get(2)?,
            })
        })
        .map_err(|_| "无法读取文档")?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "数据库文档格式异常")?;
    if docs.is_empty() {
        return Ok(None);
    }
    let active = conn
        .query_row("SELECT value FROM meta WHERE key='active'", [], |row| {
            row.get::<_, String>(0)
        })
        .optional()
        .map_err(|_| "无法读取工作区")?
        .filter(|id| docs.iter().any(|d| &d.id == id))
        .unwrap_or_else(|| docs[0].id.clone());
    Ok(Some(Workspace { docs, active }))
}
pub fn write_workspace(conn: &mut Connection, workspace: &Workspace) -> Result<(), String> {
    if workspace.docs.is_empty() || workspace.docs.len() > 5000 {
        return Err("工作区至少保留一篇文档，最多 5000 篇".into());
    }
    let mut ids = std::collections::HashSet::new();
    for d in &workspace.docs {
        if d.id.is_empty()
            || d.id.len() > 100
            || d.name.len() > 1024
            || d.text.len() > 8 * 1024 * 1024
            || !ids.insert(&d.id)
        {
            return Err("文档数据无效或过大".into());
        }
    }
    if !ids.contains(&workspace.active) {
        return Err("活动文档不存在".into());
    }
    let tx = conn.transaction().map_err(|_| "无法开始数据库事务")?;
    let old = read_workspace(&tx)?.map(|w| w.docs).unwrap_or_default();
    for doc in old {
        if !ids.contains(&doc.id) {
            tx.execute("DELETE FROM documents WHERE id=?1", [&doc.id])
                .map_err(|_| "无法移除文档")?;
        }
    }
    for (index, d) in workspace.docs.iter().enumerate() {
        let old = tx
            .query_row("SELECT content FROM documents WHERE id=?1", [&d.id], |r| {
                r.get::<_, String>(0)
            })
            .optional()
            .map_err(|_| "无法读取旧文档")?;
        if let Some(previous) = old {
            if previous != d.text {
                tx.execute(
                    "INSERT INTO revisions(document_id,content) VALUES(?1,?2)",
                    params![d.id, previous],
                )
                .map_err(|_| "无法保存修改历史")?;
                tx.execute("DELETE FROM revisions WHERE document_id=?1 AND id NOT IN(SELECT id FROM revisions WHERE document_id=?1 ORDER BY id DESC LIMIT 50)",[&d.id]).map_err(|_|"无法维护历史")?;
            }
        }
        tx.execute("INSERT INTO documents(id,name,content,position) VALUES(?1,?2,?3,?4) ON CONFLICT(id) DO UPDATE SET name=excluded.name,content=excluded.content,position=excluded.position,updated_at=CURRENT_TIMESTAMP",params![d.id,d.name,d.text,index]).map_err(|_|"保存文档失败")?;
    }
    tx.execute("INSERT INTO meta(key,value) VALUES('active',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[&workspace.active]).map_err(|_|"保存工作区失败")?;
    tx.commit().map_err(|_| "提交保存失败".into())
}
#[tauri::command]
pub fn load_workspace(state: State<AppState>) -> Result<Option<Workspace>, String> {
    read_workspace(&*state.db.lock().map_err(|_| "数据库忙")?)
}
#[tauri::command]
pub fn save_workspace(state: State<AppState>, workspace: Workspace) -> Result<(), String> {
    write_workspace(&mut *state.db.lock().map_err(|_| "数据库忙")?, &workspace)
}
#[tauri::command]
pub fn load_chats(state: State<AppState>) -> Result<Value, String> {
    let conn = state.db.lock().map_err(|_| "数据库忙")?;
    let mut stmt = conn
        .prepare("SELECT document_id,messages FROM chats")
        .map_err(|_| "读取对话失败")?;
    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|_| "读取对话失败")?;
    let mut map = serde_json::Map::new();
    for row in rows {
        let (id, text) = row.map_err(|_| "对话数据异常")?;
        map.insert(id, serde_json::from_str(&text).map_err(|_| "对话格式异常")?);
    }
    Ok(Value::Object(map))
}
#[tauri::command]
pub fn save_chat(
    state: State<AppState>,
    document_id: String,
    messages: Value,
) -> Result<(), String> {
    if !messages.is_array() || messages.as_array().unwrap().len() > 200 || document_id.len() > 100 {
        return Err("对话格式或长度无效".into());
    }
    let text = serde_json::to_string(&messages).map_err(|_| "对话编码失败")?;
    if text.len() > 8 * 1024 * 1024 {
        return Err("对话过长，请清空后重新开始".into());
    }
    state.db.lock().map_err(|_|"数据库忙")?.execute("INSERT INTO chats(document_id,messages) VALUES(?1,?2) ON CONFLICT(document_id) DO UPDATE SET messages=excluded.messages,updated_at=CURRENT_TIMESTAMP",params![document_id,text]).map_err(|_|"保存对话失败")?;
    Ok(())
}
#[tauri::command]
pub fn data_location(state: State<AppState>) -> String {
    state.data_dir.display().to_string()
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn workspace_roundtrip_reopen_and_revisions() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("test.sqlite3");
        let mut conn = open(&path).unwrap();
        assert_eq!(read_workspace(&conn).unwrap(), None);
        let mut w = Workspace {
            docs: vec![Document {
                id: "a".into(),
                name: "中文.md".into(),
                text: "# 内容\n\n原文".into(),
            }],
            active: "a".into(),
        };
        write_workspace(&mut conn, &w).unwrap();
        w.docs[0].text = "改写".into();
        write_workspace(&mut conn, &w).unwrap();
        drop(conn);
        let conn = open(&path).unwrap();
        assert_eq!(read_workspace(&conn).unwrap(), Some(w));
        let old: String = conn
            .query_row("SELECT content FROM revisions", [], |r| r.get(0))
            .unwrap();
        assert!(old.contains("原文"));
    }
    #[test]
    fn invalid_save_never_overwrites() {
        let mut c = open(Path::new(":memory:")).unwrap();
        let w = Workspace {
            docs: vec![Document {
                id: "a".into(),
                name: "a".into(),
                text: "original".into(),
            }],
            active: "a".into(),
        };
        write_workspace(&mut c, &w).unwrap();
        assert!(write_workspace(
            &mut c,
            &Workspace {
                docs: vec![],
                active: "".into()
            }
        )
        .is_err());
        assert_eq!(read_workspace(&c).unwrap(), Some(w));
    }
}
