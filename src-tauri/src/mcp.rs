//! MCP client using the official Rust SDK, including stdio and Streamable HTTP.
//! https://docs.rs/rmcp/3.8.0/rmcp/transport/index.html
use crate::{ai::ChatEvent, AppState};
use rmcp::{
    service::{RoleClient, RunningService},
    transport::{
        streamable_http_client::StreamableHttpClientTransportConfig, StreamableHttpClientTransport,
        TokioChildProcess,
    },
    ServiceExt,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{collections::BTreeMap, path::PathBuf, sync::Arc, time::Duration};
use tauri::{ipc::Channel, State};
use tokio::sync::oneshot;
pub type Client = RunningService<RoleClient, rmcp::model::ClientConfig>;
pub type Approval = (String, oneshot::Sender<bool>);
const SECRET_SERVICE: &str = "com.fuhanshen.moji.mcp";
#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Server {
    pub id: String,
    #[serde(default)]
    pub revision: String,
    pub name: String,
    pub transport: String,
    #[serde(default)]
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub has_secrets: bool,
}
#[derive(Default, Serialize, Deserialize)]
pub struct Secrets {
    #[serde(default)]
    pub env: BTreeMap<String, String>,
    #[serde(default)]
    pub headers: BTreeMap<String, String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerInput {
    pub server: Server,
    #[serde(default)]
    pub secrets: Option<Secrets>,
    #[serde(default)]
    pub clear_secrets: bool,
}
pub fn servers(state: &AppState) -> Result<Vec<Server>, String> {
    let db = state.db.lock().map_err(|_| "数据库忙")?;
    use rusqlite::OptionalExtension;
    let value: Option<String> = db
        .query_row("SELECT value FROM meta WHERE key='mcp_servers'", [], |r| {
            r.get(0)
        })
        .optional()
        .map_err(|_| "读取 MCP 设置失败")?;
    value
        .map(|s| serde_json::from_str(&s).map_err(|_| "MCP 配置格式异常".into()))
        .unwrap_or(Ok(vec![]))
}
fn persist(state: &AppState, items: &[Server]) -> Result<(), String> {
    state.db.lock().map_err(|_|"数据库忙")?.execute("INSERT INTO meta(key,value) VALUES('mcp_servers',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[serde_json::to_string(items).map_err(|_|"设置编码失败")?]).map_err(|_|"保存 MCP 设置失败")?;
    Ok(())
}
fn validate(server: &Server, secrets: &Secrets) -> Result<(), String> {
    if server.id.is_empty()
        || server.id.len() > 80
        || !server
            .id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        || server.name.trim().is_empty()
        || server.name.len() > 160
        || server.args.len() > 100
        || server.args.iter().any(|s| s.len() > 16000)
        || server.command.len() > 2048
    {
        return Err("服务名称、标识或参数无效".into());
    }
    match server.transport.as_str() {
        "stdio" if !server.command.trim().is_empty() => {}
        "http" => {
            let u = reqwest::Url::parse(&server.url).map_err(|_| "MCP 地址无效")?;
            if !["http", "https"].contains(&u.scheme())
                || u.host_str().is_none()
                || !u.username().is_empty()
                || u.password().is_some()
                || u.fragment().is_some()
                || u.query().is_some()
            {
                return Err(
                    "请输入不含密钥、查询参数的 HTTP / HTTPS MCP 地址；凭据请放入请求头".into(),
                );
            }
        }
        _ => return Err("请选择本地命令或 Streamable HTTP，并填写连接信息".into()),
    }
    if secrets.env.len() > 80
        || secrets.headers.len() > 40
        || secrets.env.iter().any(|(k, v)| {
            k.is_empty() || k.contains(['=', '\0']) || v.contains('\0') || v.len() > 16000
        })
        || secrets.headers.iter().any(|(k, v)| {
            mcp_reqwest::header::HeaderName::from_bytes(k.as_bytes()).is_err()
                || mcp_reqwest::header::HeaderValue::from_str(v).is_err()
                || [
                    "host",
                    "content-length",
                    "mcp-session-id",
                    "mcp-protocol-version",
                ]
                .contains(&k.to_lowercase().as_str())
        })
    {
        return Err("环境变量或请求头无效".into());
    }
    Ok(())
}
fn read_secrets(server: &Server) -> Result<Secrets, String> {
    if !server.has_secrets {
        return Ok(Secrets::default());
    }
    let bytes = security_framework::passwords::get_generic_password(SECRET_SERVICE, &server.id)
        .map_err(|_| "无法读取 MCP 凭据，请重新保存环境变量或请求头")?;
    serde_json::from_slice(&bytes).map_err(|_| "MCP 凭据格式异常".into())
}
#[tauri::command]
pub fn list_mcp_servers(state: State<AppState>) -> Result<Vec<Server>, String> {
    servers(&state)
}
#[tauri::command]
pub fn save_mcp_server(state: State<AppState>, input: ServerInput) -> Result<Vec<Server>, String> {
    let mut server = input.server;
    server.revision = uuid::Uuid::new_v4().to_string();
    validate(
        &server,
        input.secrets.as_ref().unwrap_or(&Secrets::default()),
    )?;
    let mut list = servers(&state)?;
    if list.len() >= 32 && !list.iter().any(|s| s.id == server.id) {
        return Err("最多添加32个 MCP 服务".into());
    }
    server.has_secrets = list
        .iter()
        .find(|s| s.id == server.id)
        .is_some_and(|s| s.has_secrets);
    if let Some(secrets) = input.secrets {
        let bytes = serde_json::to_vec(&secrets).map_err(|_| "凭据编码失败")?;
        security_framework::passwords::set_generic_password(SECRET_SERVICE, &server.id, &bytes)
            .map_err(|_| "无法保存 MCP 凭据到钥匙串")?;
        server.has_secrets = true;
    } else if input.clear_secrets {
        match security_framework::passwords::delete_generic_password(SECRET_SERVICE, &server.id) {
            Ok(()) => {}
            Err(e) if e.code() == -25300 => {}
            Err(_) => return Err("无法清除 MCP 凭据".into()),
        };
        server.has_secrets = false;
    }
    list.retain(|s| s.id != server.id);
    list.push(server.clone());
    persist(&state, &list)?;
    state
        .mcp_clients
        .lock()
        .map_err(|_| "连接状态异常")?
        .remove(&server.id);
    Ok(list)
}
#[tauri::command]
pub fn remove_mcp_server(state: State<AppState>, id: String) -> Result<Vec<Server>, String> {
    let mut list = servers(&state)?;
    if list.iter().any(|s| s.id == id && s.has_secrets) {
        match security_framework::passwords::delete_generic_password(SECRET_SERVICE, &id) {
            Ok(()) => {}
            Err(e) if e.code() == -25300 => {}
            Err(_) => return Err("无法清除 MCP 凭据".into()),
        }
    }
    list.retain(|s| s.id != id);
    persist(&state, &list)?;
    state
        .mcp_clients
        .lock()
        .map_err(|_| "连接状态异常")?
        .remove(&id);
    Ok(list)
}
fn resolve_command(name: &str) -> PathBuf {
    let p = PathBuf::from(name);
    if p.components().count() > 1 {
        return p;
    }
    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_default();
    let mut dirs = vec![
        home.join(".local/bin"),
        home.join(".cargo/bin"),
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/usr/local/bin"),
        PathBuf::from("/usr/bin"),
        PathBuf::from("/bin"),
    ];
    if let Some(v) = std::env::var_os("PATH") {
        dirs.extend(std::env::split_paths(&v))
    }
    dirs.into_iter()
        .map(|d| d.join(name))
        .find(|p| p.is_file())
        .unwrap_or(p)
}
pub async fn open(server: &Server, secrets: &Secrets) -> Result<Arc<Client>, String> {
    validate(server, secrets)?;
    let connect = async {
        if server.transport == "stdio" {
            let mut command = crate::ai::command(&resolve_command(&server.command));
            command
                .args(&server.args)
                .envs(&secrets.env)
                .stderr(std::process::Stdio::null());
            let transport = TokioChildProcess::new(command)
                .map_err(|_| "无法启动 MCP 命令，请检查路径、运行环境和参数".to_string())?;
            rmcp::model::ClientConfig::default()
                .with_protocol_version(rmcp::model::ProtocolVersion::V_2025_11_25)
                .serve(transport)
                .await
                .map_err(|_| "MCP 握手失败，请检查命令是否为 MCP 服务".to_string())
        } else {
            let mut config = StreamableHttpClientTransportConfig::with_uri(server.url.clone());
            for (k, v) in &secrets.headers {
                config.custom_headers.insert(
                    k.parse().map_err(|_| "请求头名称无效")?,
                    v.parse().map_err(|_| "请求头内容无效")?,
                );
            }
            let client = mcp_reqwest::Client::builder()
                .redirect(mcp_reqwest::redirect::Policy::none())
                .connect_timeout(Duration::from_secs(12))
                .build()
                .map_err(|_| "无法创建 MCP 连接")?;
            rmcp::model::ClientConfig::default()
                .with_protocol_version(rmcp::model::ProtocolVersion::V_2025_11_25)
                .serve(StreamableHttpClientTransport::with_client(client, config))
                .await
                .map_err(|_| "MCP HTTP 握手失败，请检查地址、凭据和协议".to_string())
        }
    };
    tokio::time::timeout(Duration::from_secs(20), connect)
        .await
        .map_err(|_| "MCP 连接超时".to_string())?
        .map(Arc::new)
}
pub async fn connection(state: &AppState, id: &str) -> Result<(Server, Arc<Client>), String> {
    let server = servers(state)?
        .into_iter()
        .find(|s| s.id == id && s.enabled)
        .ok_or("服务未启用或已移除")?;
    if let Some(client) = state
        .mcp_clients
        .lock()
        .map_err(|_| "连接状态异常")?
        .get(id)
        .filter(|c| !c.is_closed())
        .cloned()
    {
        return Ok((server, client));
    }
    let secrets = read_secrets(&server)?;
    let client = open(&server, &secrets).await?;
    if !servers(state)?.iter().any(|current| current == &server) {
        return Err("连接期间服务配置已改变，请重试".into());
    }
    state
        .mcp_clients
        .lock()
        .map_err(|_| "连接状态异常")?
        .insert(id.to_string(), client.clone());
    Ok((server, client))
}
#[tauri::command]
pub async fn connect_mcp_server(state: State<'_, AppState>, id: String) -> Result<Value, String> {
    let (_, client) = connection(&state, &id).await?;
    let tools = tokio::time::timeout(Duration::from_secs(20), client.list_all_tools())
        .await
        .map_err(|_| "获取工具超时")?
        .map_err(|_| "无法读取 MCP 工具列表")?;
    Ok(json!({"tools":tools,"connected":true}))
}
#[tauri::command]
pub fn disconnect_mcp_server(state: State<AppState>, id: String) -> Result<(), String> {
    state
        .mcp_clients
        .lock()
        .map_err(|_| "连接状态异常")?
        .remove(&id);
    Ok(())
}
#[tauri::command]
pub fn approve_mcp_tool(
    state: State<AppState>,
    call_id: String,
    allow: bool,
) -> Result<(), String> {
    let pending = state
        .mcp_approvals
        .lock()
        .map_err(|_| "请求状态异常")?
        .remove(&call_id)
        .ok_or("此工具请求已过期或已处理")?;
    pending.1.send(allow).map_err(|_| "此请求已结束".into())
}
#[derive(Clone)]
pub struct AgentTool {
    pub alias: String,
    pub server: Server,
    pub name: String,
    pub definition: Value,
}
pub async fn agent_tools(state: &AppState) -> Result<Vec<AgentTool>, String> {
    let mut result = vec![];
    for server in servers(state)?.into_iter().filter(|s| s.enabled) {
        let (_, client) = connection(state, &server.id)
            .await
            .map_err(|e| format!("{}：{e}", server.name))?;
        let tools = tokio::time::timeout(Duration::from_secs(20), client.list_all_tools())
            .await
            .map_err(|_| "获取工具超时")?
            .map_err(|_| "获取 MCP 工具失败")?;
        for tool in tools {
            if result.len() >= 64 {
                return Err("启用的工具超过64个，请停用部分服务后重试".into());
            }
            let alias = format!("mcp_{}", result.len());
            result.push(AgentTool{alias:alias.clone(),server:server.clone(),name:tool.name.to_string(),definition:json!({"type":"function","function":{"name":alias,"description":format!("{} / {}: {}",server.name,tool.name,tool.description.as_deref().unwrap_or("")),"parameters":tool.input_schema}})});
        }
    }
    Ok(result)
}
pub async fn execute(
    state: &AppState,
    request_id: &str,
    tool: &AgentTool,
    args: Value,
    channel: &Channel<ChatEvent>,
) -> Result<String, String> {
    let args = args
        .as_object()
        .cloned()
        .ok_or("工具参数必须是 JSON 对象")?;
    if serde_json::to_vec(&args).map_err(|_| "参数编码失败")?.len() > 100000 {
        return Err("工具参数过长".into());
    }
    let id = uuid::Uuid::new_v4().to_string();
    let (tx, rx) = oneshot::channel();
    state
        .mcp_approvals
        .lock()
        .map_err(|_| "请求状态异常")?
        .insert(id.clone(), (request_id.into(), tx));
    channel
        .send(ChatEvent::ToolRequest {
            call_id: id.clone(),
            server: tool.server.name.clone(),
            tool: tool.name.clone(),
            arguments: json!(args),
        })
        .map_err(|_| "问答窗口已关闭")?;
    let allowed = tokio::time::timeout(Duration::from_secs(90), rx)
        .await
        .ok()
        .and_then(Result::ok)
        .unwrap_or(false);
    state
        .mcp_approvals
        .lock()
        .map_err(|_| "请求状态异常")?
        .remove(&id);
    let outcome = if !allowed {
        Err("用户拒绝或确认已超时".to_string())
    } else {
        async {
            if !servers(state)?.iter().any(|s| s == &tool.server) {
                return Err("工具确认后服务配置已改变，请重新提问".into());
            }
            let (_, client) = connection(state, &tool.server.id).await?;
            let response = tokio::time::timeout(
                Duration::from_secs(45),
                client.call_tool(
                    rmcp::model::CallToolRequestParams::new(tool.name.clone()).with_arguments(args),
                ),
            )
            .await
            .map_err(|_| "工具执行超时".to_string())?
            .map_err(|_| "工具执行失败，连接可能已断开".to_string())?;
            if response.is_error == Some(true) {
                Err(serde_json::to_string(&response).unwrap_or_default())
            } else {
                Ok(serde_json::to_string(&response).unwrap_or_default())
            }
        }
        .await
    };
    let failed = outcome.is_err();
    let text = outcome.unwrap_or_else(|e| format!("工具错误：{e}"));
    let text: String = text.chars().take(30000).collect();
    channel
        .send(ChatEvent::ToolResult {
            call_id: id,
            server: tool.server.name.clone(),
            tool: tool.name.clone(),
            content: text.clone(),
            is_error: failed,
        })
        .map_err(|_| "问答窗口已关闭")?;
    Ok(text)
}
#[cfg(test)]
mod tests {
    use super::*;
    fn sample() -> Server {
        Server {
            id: "test".into(),
            revision: String::new(),
            name: "测试服务".into(),
            transport: "stdio".into(),
            command: "/usr/bin/false".into(),
            args: vec![],
            url: String::new(),
            enabled: true,
            has_secrets: false,
        }
    }
    #[test]
    fn validates_transports_and_secrets() {
        assert!(validate(&sample(), &Secrets::default()).is_ok());
        let mut s = sample();
        s.transport = "http".into();
        s.url = "file:///etc/passwd".into();
        assert!(validate(&s, &Secrets::default()).is_err());
        s.url = "https://example.org/mcp".into();
        assert!(validate(&s, &Secrets::default()).is_ok());
        s.url = "https://secret@example.org/mcp".into();
        assert!(validate(&s, &Secrets::default()).is_err());
        let mut secrets = Secrets::default();
        secrets.headers.insert("Mcp-Session-Id".into(), "x".into());
        assert!(validate(&sample(), &secrets).is_err());
    }
    #[tokio::test]
    async fn invalid_stdio_fails_cleanly() {
        assert!(open(&sample(), &Secrets::default()).await.is_err());
    }
}
#[cfg(test)]
pub(crate) mod test_support {
    use super::*;
    use std::sync::Mutex;
    pub fn fixture() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/mcp-server.py")
    }
    pub fn server() -> Server {
        Server {
            id: "fixture".into(),
            revision: "test".into(),
            name: "本机测试".into(),
            transport: "stdio".into(),
            command: "/usr/bin/python3".into(),
            args: vec![fixture().to_string_lossy().to_string()],
            url: String::new(),
            enabled: true,
            has_secrets: false,
        }
    }
    pub fn state(server: &Server, dir: &std::path::Path) -> Arc<AppState> {
        let conn = crate::db::open(&dir.join("test.sqlite3")).unwrap();
        let state = Arc::new(AppState {
            db: Mutex::new(conn),
            data_dir: dir.into(),
            jobs: Mutex::new(Default::default()),
            slots: Arc::new(tokio::sync::Semaphore::new(2)),
            mcp_clients: Mutex::new(Default::default()),
            mcp_approvals: Mutex::new(Default::default()),
        });
        persist(&state, &[server.clone()]).unwrap();
        state
    }
    pub fn approving_channel(
        state: Arc<AppState>,
        allow: bool,
    ) -> (Channel<ChatEvent>, Arc<Mutex<Vec<Value>>>) {
        let events = Arc::new(Mutex::new(vec![]));
        let output = events.clone();
        let channel = Channel::new(move |body| {
            if let tauri::ipc::InvokeResponseBody::Json(text) = body {
                let event: Value = serde_json::from_str(&text).unwrap();
                if event["type"] == "toolrequest" {
                    let call = event["callId"].as_str().unwrap();
                    let pending = state.mcp_approvals.lock().unwrap().remove(call).unwrap();
                    pending.1.send(allow).unwrap();
                }
                output.lock().unwrap().push(event);
            }
            Ok(())
        });
        (channel, events)
    }
}
#[cfg(test)]
mod integration_tests {
    use super::test_support::*;
    use super::*;
    #[tokio::test]
    async fn stdio_handshake_pagination_and_utf8_tool_call() {
        let client = open(&server(), &Secrets::default()).await.unwrap();
        let tools = client.list_all_tools().await.unwrap();
        assert_eq!(tools.len(), 2);
        let result = client
            .call_tool(
                rmcp::model::CallToolRequestParams::new("echo")
                    .with_arguments(json!({"text":"中文 😀"}).as_object().unwrap().clone()),
            )
            .await
            .unwrap();
        assert!(serde_json::to_string(&result).unwrap().contains("中文 😀"));
    }
    #[tokio::test]
    async fn http_handshake_pagination_and_call() {
        use tokio::io::{AsyncBufReadExt, BufReader};
        let mut child = tokio::process::Command::new("/usr/bin/python3")
            .arg(fixture())
            .arg("--http")
            .stdout(std::process::Stdio::piped())
            .kill_on_drop(true)
            .spawn()
            .unwrap();
        let mut lines = BufReader::new(child.stdout.take().unwrap()).lines();
        let url = tokio::time::timeout(Duration::from_secs(8), lines.next_line())
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        let mut config = server();
        config.transport = "http".into();
        config.url = url;
        let client = open(&config, &Secrets::default()).await.unwrap();
        assert_eq!(client.list_all_tools().await.unwrap().len(), 2);
        let result = client
            .call_tool(
                rmcp::model::CallToolRequestParams::new("text_stats")
                    .with_arguments(json!({"text":"中文"}).as_object().unwrap().clone()),
            )
            .await
            .unwrap();
        assert!(serde_json::to_string(&result)
            .unwrap()
            .contains("characters"));
        child.kill().await.unwrap();
    }
    #[tokio::test]
    async fn denied_tools_never_execute_and_allowed_tools_do() {
        let dir = tempfile::tempdir().unwrap();
        let marker = dir.path().join("calls");
        let mut server = server();
        server
            .args
            .extend(["--marker".into(), marker.to_string_lossy().to_string()]);
        let state = state(&server, dir.path());
        let tools = agent_tools(&state).await.unwrap();
        assert!(!marker.exists());
        let (channel, events) = approving_channel(state.clone(), false);
        let result = execute(&state, "deny", &tools[0], json!({"text":"中文"}), &channel)
            .await
            .unwrap();
        assert!(result.contains("拒绝"));
        assert!(!marker.exists());
        assert_eq!(events.lock().unwrap().last().unwrap()["isError"], true);
        let (channel, events) = approving_channel(state.clone(), true);
        let result = execute(&state, "allow", &tools[0], json!({"text":"中文"}), &channel)
            .await
            .unwrap();
        assert!(result.contains("中文"));
        assert_eq!(std::fs::read_to_string(marker).unwrap(), "echo\n");
        assert_eq!(events.lock().unwrap().last().unwrap()["type"], "toolresult");
        assert!(state.mcp_approvals.lock().unwrap().is_empty());
    }
    #[tokio::test]
    async fn approval_cannot_run_a_changed_service() {
        let dir = tempfile::tempdir().unwrap();
        let server = server();
        let state = state(&server, dir.path());
        let tools = agent_tools(&state).await.unwrap();
        let mut changed = server;
        changed.revision = "changed".into();
        persist(&state, &[changed]).unwrap();
        let (channel, _) = approving_channel(state.clone(), true);
        let result = execute(
            &state,
            "changed",
            &tools[0],
            json!({"text":"test"}),
            &channel,
        )
        .await
        .unwrap();
        assert!(result.contains("配置已改变"));
    }
}
