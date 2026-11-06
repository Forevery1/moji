//! Manual update checks via GitHub's public latest-release API.
//! https://docs.github.com/en/rest/releases/releases#get-the-latest-release
use futures_util::StreamExt;
use serde::Serialize;
use serde_json::Value;
use std::time::Duration;
const REPO: &str = "fuhanshen/moji";
const MANIFEST: &str = "https://github.com/fuhanshen/moji/releases/latest/download/latest.json";
const API: &str = "https://api.github.com/repos/fuhanshen/moji/releases/latest";
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub current_version: String,
    pub latest_version: Option<String>,
    pub has_update: bool,
    pub architecture: String,
    pub release_url: String,
    #[serde(rename = "downloadURL")]
    pub download_url: Option<String>,
    pub notes: String,
    pub published_at: Option<String>,
    pub unpublished: bool,
}
fn architecture() -> &'static str {
    if cfg!(target_arch = "aarch64") {
        "Apple-Silicon"
    } else if cfg!(target_arch = "x86_64") {
        "Intel"
    } else {
        "Other"
    }
}
fn empty(current: &str, arch: &str) -> UpdateInfo {
    UpdateInfo {
        current_version: current.into(),
        latest_version: None,
        has_update: false,
        architecture: arch.into(),
        release_url: format!("https://github.com/{REPO}/releases"),
        download_url: None,
        notes: String::new(),
        published_at: None,
        unpublished: true,
    }
}
fn trusted_url(value: &str) -> bool {
    let Ok(url) = reqwest::Url::parse(value) else {
        return false;
    };
    url.scheme() == "https"
        && url.host_str() == Some("github.com")
        && url.port().is_none()
        && url.username().is_empty()
        && url.password().is_none()
        && url.query().is_none()
        && url.fragment().is_none()
        && (url.path() == format!("/{REPO}/releases")
            || url.path() == format!("/{REPO}/releases/latest")
            || url.path().starts_with(&format!("/{REPO}/releases/tag/"))
            || url
                .path()
                .starts_with(&format!("/{REPO}/releases/download/")))
}
fn parse_release(value: &Value, current: &str, arch: &str) -> Result<UpdateInfo, String> {
    if value["draft"] == true || value["prerelease"] == true {
        return Err("更新源返回了草稿或预览版，请稍后重试".into());
    }
    let tag = value["tag_name"]
        .as_str()
        .ok_or("GitHub 版本信息缺少版本号")?;
    let raw = tag.strip_prefix('v').unwrap_or(tag);
    let latest = semver::Version::parse(raw).map_err(|_| "GitHub 版本号格式不受支持")?;
    let installed = semver::Version::parse(current).map_err(|_| "当前应用版本号无效")?;
    if !latest.pre.is_empty() {
        return Err("更新源返回了预览版本，请稍后重试".into());
    }
    let name = format!("Moji-{latest}-{arch}.dmg");
    let mut expected =
        reqwest::Url::parse(&format!("https://github.com/{REPO}/releases/download/")).unwrap();
    expected
        .path_segments_mut()
        .unwrap()
        .pop_if_empty()
        .push(tag)
        .push(&name);
    let download = value["assets"]
        .as_array()
        .and_then(|assets| {
            assets
                .iter()
                .find(|asset| asset["name"].as_str() == Some(name.as_str()))
        })
        .and_then(|asset| asset["browser_download_url"].as_str())
        .filter(|url| trusted_url(url) && reqwest::Url::parse(url).ok().as_ref() == Some(&expected))
        .map(str::to_owned);
    let mut release =
        reqwest::Url::parse(&format!("https://github.com/{REPO}/releases/tag/")).unwrap();
    release
        .path_segments_mut()
        .unwrap()
        .pop_if_empty()
        .push(tag);
    Ok(UpdateInfo {
        current_version: current.into(),
        latest_version: Some(latest.to_string()),
        has_update: latest.cmp_precedence(&installed).is_gt(),
        architecture: arch.into(),
        release_url: release.to_string(),
        download_url: download,
        notes: value["body"]
            .as_str()
            .unwrap_or("")
            .chars()
            .take(30000)
            .collect(),
        published_at: value["published_at"].as_str().map(str::to_owned),
        unpublished: false,
    })
}
fn asset_redirect_allowed(url: &reqwest::Url) -> bool {
    if url.scheme() != "https"
        || url.port().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return false;
    }
    match url.host_str() {
        Some("github.com") => url.path().starts_with(&format!("/{REPO}/releases/")),
        Some("objects.githubusercontent.com" | "release-assets.githubusercontent.com") => true,
        _ => false,
    }
}
async fn fetch(
    endpoint: &str,
    current: &str,
    arch: &str,
    asset: bool,
) -> Result<UpdateInfo, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .connect_timeout(Duration::from_secs(8))
        .redirect(if asset {
            reqwest::redirect::Policy::custom(|attempt| {
                if attempt.previous().len() < 5 && asset_redirect_allowed(attempt.url()) {
                    attempt.follow()
                } else {
                    attempt.error("Untrusted release redirect")
                }
            })
        } else {
            reqwest::redirect::Policy::none()
        })
        .build()
        .map_err(|_| "无法创建更新连接")?;
    let response = client
        .get(endpoint)
        .header(
            "Accept",
            if asset {
                "application/json"
            } else {
                "application/vnd.github+json"
            },
        )
        .header("User-Agent", format!("Moji/{current}"))
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await
        .map_err(|_| "无法连接 GitHub，请检查网络后重试")?;
    match response.status().as_u16() {
        404 => return Ok(empty(current, arch)),
        403 | 429 => return Err("GitHub 请求次数受限，请稍后重试".into()),
        200 => {}
        code => return Err(format!("GitHub 返回 {code}，暂时无法检查更新")),
    }
    let mut stream = response.bytes_stream();
    let mut bytes = Vec::new();
    while let Some(part) = stream.next().await {
        let part = part.map_err(|_| "更新信息连接中断，请重试")?;
        if bytes.len() + part.len() > 1024 * 1024 {
            return Err("GitHub 更新信息过大".into());
        }
        bytes.extend_from_slice(&part);
    }
    let value: Value = serde_json::from_slice(&bytes).map_err(|_| "GitHub 返回了无效的更新信息")?;
    parse_release(&value, current, arch)
}
// Release assets do not consume the anonymous REST API quota. Prefer the public
// latest.json asset, then use the API for releases that do not have that asset.
// https://docs.github.com/en/repositories/releasing-projects-on-github/linking-to-releases
async fn check_sources(
    manifest: &str,
    api: &str,
    current: &str,
    arch: &str,
) -> Result<UpdateInfo, String> {
    if let Ok(info) = fetch(manifest, current, arch, true).await {
        if !info.unpublished {
            return Ok(info);
        }
    }
    fetch(api, current, arch, false).await
}
#[tauri::command]
pub async fn check_for_updates() -> Result<UpdateInfo, String> {
    check_sources(MANIFEST, API, env!("CARGO_PKG_VERSION"), architecture()).await
}
#[tauri::command]
pub async fn open_update_link(url: String) -> Result<(), String> {
    if !trusted_url(&url) {
        return Err("更新链接不是此应用的 GitHub Release 地址".into());
    }
    let status = tokio::process::Command::new("/usr/bin/open")
        .arg(url)
        .status()
        .await
        .map_err(|_| "无法打开浏览器")?;
    if status.success() {
        Ok(())
    } else {
        Err("无法打开更新链接，请稍后重试".into())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn release(version: &str, arch: &str) -> Value {
        json!({"tag_name":format!("v{version}"),"draft":false,"prerelease":false,"body":"新增功能与修复", "assets":[{"name":format!("Moji-{version}-{arch}.dmg"),"browser_download_url":format!("https://github.com/fuhanshen/moji/releases/download/v{version}/Moji-{version}-{arch}.dmg")} ]})
    }
    #[test]
    fn versions_and_architecture_are_compared_correctly() {
        let info = parse_release(&release("0.10.0", "Intel"), "0.9.0", "Intel").unwrap();
        assert!(info.has_update);
        assert!(info.download_url.unwrap().ends_with("Intel.dmg"));
        assert!(
            !parse_release(&release("0.8.0", "Intel"), "0.8.0", "Intel")
                .unwrap()
                .has_update
        );
        assert!(
            !parse_release(&release("0.7.1", "Intel"), "0.8.0", "Intel")
                .unwrap()
                .has_update
        );
        assert!(
            parse_release(&release("0.9.0", "Intel"), "0.8.0", "Apple-Silicon")
                .unwrap()
                .download_url
                .is_none()
        );
        assert!(
            !parse_release(&release("1.0.0+other", "Intel"), "1.0.0+build", "Intel")
                .unwrap()
                .has_update
        );
    }
    #[test]
    fn rejects_invalid_versions_previews_and_external_assets() {
        let mut r = release("0.9.0", "Intel");
        r["prerelease"] = json!(true);
        assert!(parse_release(&r, "0.8.0", "Intel").is_err());
        r = release("0.9.0-beta.1", "Intel");
        assert!(parse_release(&r, "0.8.0", "Intel").is_err());
        r = release("invalid", "Intel");
        assert!(parse_release(&r, "0.8.0", "Intel").is_err());
        r = release("0.9.0", "Intel");
        r["assets"][0]["browser_download_url"] = json!("https://evil.example/update.dmg");
        assert!(parse_release(&r, "0.8.0", "Intel")
            .unwrap()
            .download_url
            .is_none());
        for url in [
            "file:///tmp/a",
            "https://github.com/other/repo/releases",
            "https://github.com/fuhanshen/moji/releases-evil",
            "https://github.com.evil.com/fuhanshen/moji/releases",
            "https://user:secret@github.com/fuhanshen/moji/releases",
        ] {
            assert!(!trusted_url(url));
        }
    }
    #[tokio::test]
    async fn public_http_contract_and_rate_limit() {
        use std::io::{Read, Write};
        for (code, body) in [
            (200, release("0.9.0", "Intel").to_string()),
            (404, "{}".into()),
            (403, "{}".into()),
            (200, "broken".into()),
        ] {
            let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
            let address = listener.local_addr().unwrap();
            let invalid_json = body == "broken";
            let handle = std::thread::spawn(move || {
                let (mut socket, _) = listener.accept().unwrap();
                let mut bytes = [0; 4096];
                let count = socket.read(&mut bytes).unwrap();
                let request = String::from_utf8_lossy(&bytes[..count]).to_lowercase();
                assert!(request.contains("user-agent: moji/0.8.0"));
                assert!(!request.contains("authorization:"));
                write!(socket,"HTTP/1.1 {code} Test\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len()).unwrap();
            });
            let result = fetch(&format!("http://{address}/latest"), "0.8.0", "Intel", false).await;
            match code {
                404 => assert!(result.unwrap().unpublished),
                403 => assert!(result.unwrap_err().contains("次数")),
                200 if !invalid_json => assert!(result.unwrap().has_update),
                _ => assert!(result.is_err()),
            }
            handle.join().unwrap();
        }
    }
}

#[cfg(test)]
mod fallback_tests {
    use super::*;
    use serde_json::json;
    fn server(code: u16, body: String) -> (String, std::thread::JoinHandle<()>) {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let handle = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut buffer = [0; 4096];
            let n = socket.read(&mut buffer).unwrap();
            assert!(!String::from_utf8_lossy(&buffer[..n])
                .to_lowercase()
                .contains("authorization:"));
            write!(socket,"HTTP/1.1 {code} Test\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len()).unwrap();
        });
        (format!("http://{address}/latest"), handle)
    }
    #[tokio::test]
    async fn release_manifest_avoids_api_and_missing_manifest_uses_api() {
        let body=json!({"tag_name":"v0.9.0","assets":[{"name":"Moji-0.9.0-Intel.dmg","browser_download_url":"https://github.com/fuhanshen/moji/releases/download/v0.9.0/Moji-0.9.0-Intel.dmg"}]}).to_string();
        let (url, handle) = server(200, body.clone());
        let info = check_sources(&url, "http://127.0.0.1:1/not-called", "0.8.0", "Intel")
            .await
            .unwrap();
        assert!(info.has_update);
        handle.join().unwrap();
        let (first, a) = server(404, "{}".into());
        let (second, b) = server(200, body);
        assert!(check_sources(&first, &second, "0.8.0", "Intel")
            .await
            .unwrap()
            .download_url
            .is_some());
        a.join().unwrap();
        b.join().unwrap();
    }
    #[test]
    fn release_redirects_are_limited_to_github_asset_hosts() {
        for url in [
            "https://github.com/fuhanshen/moji/releases/download/v0.8.0/latest.json",
            "https://release-assets.githubusercontent.com/example?token=public",
            "https://objects.githubusercontent.com/example",
        ] {
            assert!(asset_redirect_allowed(&reqwest::Url::parse(url).unwrap()))
        }
        for url in [
            "http://github.com/fuhanshen/moji/releases/latest",
            "https://github.com/login",
            "https://evil.example/file",
            "https://user:pass@release-assets.githubusercontent.com/file",
        ] {
            assert!(!asset_redirect_allowed(&reqwest::Url::parse(url).unwrap()))
        }
    }
}
