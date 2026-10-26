use std::{
    fs::{self, File},
    io::Write,
    net::{IpAddr, Ipv4Addr, SocketAddr},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

use axum::{
    Router,
    body::Body,
    extract::State as AxumState,
    middleware::{self, Next},
    response::Response,
};
use http::{Method, Request};
use rmcp::transport::streamable_http_server::{
    StreamableHttpServerConfig, StreamableHttpService, session::local::LocalSessionManager,
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::net::TcpListener;
use tokio_util::sync::CancellationToken;

use crate::{mcp_access::McpAccess, mcp_tools::MermagramMcpHandler};

const DEFAULT_PORT: u16 = 38641;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpStatus {
    pub running: bool,
    pub port: u16,
    pub endpoint: String,
    pub error: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct McpSettings {
    port: u16,
}

impl Default for McpSettings {
    fn default() -> Self {
        Self { port: DEFAULT_PORT }
    }
}

struct RunningServer {
    cancellation: CancellationToken,
}

pub struct McpServerState {
    settings_path: PathBuf,
    settings: Mutex<McpSettings>,
    running: Mutex<Option<RunningServer>>,
    pub access: Arc<McpAccess>,
}

impl McpServerState {
    pub fn open(settings_path: impl Into<PathBuf>) -> Result<Self, String> {
        let settings_path = settings_path.into();
        let settings = if settings_path.exists() {
            serde_json::from_reader(File::open(&settings_path).map_err(|e| e.to_string())?)
                .map_err(|e| format!("MCP settings could not be read: {e}"))?
        } else {
            McpSettings::default()
        };
        Ok(Self {
            settings_path,
            settings: Mutex::new(settings),
            running: Mutex::new(None),
            access: Arc::new(McpAccess::default()),
        })
    }

    pub fn status(&self) -> McpStatus {
        let port = self
            .settings
            .lock()
            .map(|settings| settings.port)
            .unwrap_or(DEFAULT_PORT);
        let running = self
            .running
            .lock()
            .map(|slot| slot.is_some())
            .unwrap_or(false);
        McpStatus {
            running,
            port,
            endpoint: endpoint(port),
            error: None,
        }
    }

    fn set_port(&self, port: u16) -> Result<(), String> {
        if port == 0 {
            return Err("Port must be between 1 and 65535".into());
        }
        let mut settings = self
            .settings
            .lock()
            .map_err(|_| "MCP settings are unavailable")?;
        if self
            .running
            .lock()
            .map_err(|_| "MCP server state is unavailable")?
            .is_some()
        {
            return Err("Stop the MCP server before changing its port".into());
        }
        let next = McpSettings { port };
        persist_settings(&self.settings_path, &next)?;
        *settings = next;
        Ok(())
    }

    async fn select_available_port(&self) -> Result<u16, String> {
        let listener = bind_loopback(0).await?;
        let port = listener
            .local_addr()
            .map_err(|error| format!("Could not read selected MCP port: {error}"))?
            .port();
        drop(listener);
        self.set_port(port)?;
        Ok(port)
    }

    async fn start(&self, app: AppHandle) -> Result<McpStatus, String> {
        let port = self
            .settings
            .lock()
            .map_err(|_| "MCP settings are unavailable")?
            .port;
        if self
            .running
            .lock()
            .map_err(|_| "MCP server state is unavailable")?
            .is_some()
        {
            return Ok(McpStatus {
                running: true,
                port,
                endpoint: endpoint(port),
                error: None,
            });
        }
        let listener = bind_loopback(port).await?;

        let cancellation = CancellationToken::new();
        let config = StreamableHttpServerConfig::default()
            .with_allowed_hosts(["127.0.0.1", "localhost", "::1"])
            .enforce_origin_validation()
            .with_cancellation_token(cancellation.clone());
        let handler_app = app.clone();
        let handler_access = self.access.clone();
        let service: StreamableHttpService<MermagramMcpHandler, LocalSessionManager> =
            StreamableHttpService::new(
                move || {
                    Ok(MermagramMcpHandler::new(
                        handler_app.clone(),
                        handler_access.clone(),
                    ))
                },
                Default::default(),
                config,
            );
        let router =
            Router::new()
                .nest_service("/mcp", service)
                .layer(middleware::from_fn_with_state(
                    (self.access.clone(), app.clone()),
                    cleanup_closed_session,
                ));
        let shutdown = cancellation.clone();
        let mut running = self
            .running
            .lock()
            .map_err(|_| "MCP server state is unavailable")?;
        if running.is_some() {
            cancellation.cancel();
            return Ok(McpStatus {
                running: true,
                port,
                endpoint: endpoint(port),
                error: None,
            });
        }
        tauri::async_runtime::spawn(async move {
            if let Err(error) = axum::serve(listener, router)
                .with_graceful_shutdown(shutdown.cancelled_owned())
                .await
            {
                eprintln!("Mermagram MCP server stopped with an error: {error}");
            }
        });
        *running = Some(RunningServer { cancellation });
        Ok(McpStatus {
            running: true,
            port,
            endpoint: endpoint(port),
            error: None,
        })
    }

    fn stop(&self) -> Result<McpStatus, String> {
        let mut running = self
            .running
            .lock()
            .map_err(|_| "MCP server state is unavailable")?;
        if let Some(server) = running.take() {
            server.cancellation.cancel();
        }
        self.access.clear();
        drop(running);
        Ok(self.status())
    }
}

fn endpoint(port: u16) -> String {
    format!("http://127.0.0.1:{port}/mcp")
}

async fn cleanup_closed_session(
    AxumState((access, app)): AxumState<(Arc<McpAccess>, AppHandle)>,
    request: Request<Body>,
    next: Next,
) -> Response {
    let session_id = if request.method() == Method::DELETE {
        request
            .headers()
            .get("mcp-session-id")
            .and_then(|value| value.to_str().ok())
            .map(str::to_owned)
    } else {
        None
    };
    let response = next.run(request).await;
    if let Some(session_id) = session_id {
        if let Some(binding) = access.unbind_session(&session_id) {
            let _ = app.emit(
                "mcp:connection-state",
                serde_json::json!({
                    "workspaceId": binding.workspace_id,
                    "workspaceName": binding.workspace_name,
                    "clientName": binding.client_name,
                    "connected": false,
                }),
            );
        }
    }
    response
}

async fn bind_loopback(port: u16) -> Result<TcpListener, String> {
    let address = SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), port);
    TcpListener::bind(address)
        .await
        .map_err(|error| format!("Could not start MCP on 127.0.0.1:{port}: {error}"))
}

fn persist_settings(path: &Path, settings: &McpSettings) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "MCP settings path has no parent".to_string())?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let mut file = tempfile::NamedTempFile::new_in(parent).map_err(|error| error.to_string())?;
    serde_json::to_writer(&mut file, settings).map_err(|error| error.to_string())?;
    file.write_all(b"\n").map_err(|error| error.to_string())?;
    file.as_file()
        .sync_all()
        .map_err(|error| error.to_string())?;
    file.persist(path)
        .map_err(|error| error.error.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn start_mcp_server(
    app: AppHandle,
    state: State<'_, McpServerState>,
) -> Result<McpStatus, String> {
    let status = state.start(app.clone()).await?;
    let _ = app.emit("mcp:status", &status);
    Ok(status)
}

#[tauri::command]
pub fn stop_mcp_server(
    app: AppHandle,
    state: State<'_, McpServerState>,
) -> Result<McpStatus, String> {
    let status = state.stop()?;
    let _ = app.emit("mcp:status", &status);
    Ok(status)
}

#[tauri::command]
pub fn set_mcp_port(
    app: AppHandle,
    state: State<'_, McpServerState>,
    port: u16,
) -> Result<McpStatus, String> {
    state.set_port(port)?;
    let status = state.status();
    let _ = app.emit("mcp:status", &status);
    Ok(status)
}

#[tauri::command]
pub async fn select_mcp_port(
    app: AppHandle,
    state: State<'_, McpServerState>,
) -> Result<McpStatus, String> {
    state.select_available_port().await?;
    let status = state.status();
    let _ = app.emit("mcp:status", &status);
    Ok(status)
}

#[tauri::command]
pub fn get_mcp_status(state: State<'_, McpServerState>) -> McpStatus {
    state.status()
}

#[tauri::command]
pub fn get_mcp_connections(
    state: State<'_, McpServerState>,
) -> Result<Vec<crate::mcp_access::ClientBinding>, String> {
    state.access.clients()
}

#[tauri::command]
pub fn decide_mcp_approval(
    state: State<'_, McpServerState>,
    request_id: String,
    approved: bool,
) -> Result<(), String> {
    state.access.decide(&request_id, approved)
}

pub fn stop_on_exit(app: &AppHandle) {
    if let Some(state) = app.try_state::<McpServerState>() {
        let _ = state.stop();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn port_setting_persists_and_loopback_port_can_be_bound() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("mcp-settings.json");
        let state = McpServerState::open(&path).unwrap();
        let probe = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = probe.local_addr().unwrap().port();
        drop(probe);
        state.set_port(port).unwrap();
        drop(state);

        let state = McpServerState::open(&path).unwrap();
        assert_eq!(state.status().port, port);
        let listener = bind_loopback(port).await.unwrap();
        assert!(listener.local_addr().unwrap().ip().is_loopback());
        assert!(!state.status().running);
    }

    #[tokio::test]
    async fn occupied_port_is_reported_without_starting() {
        let dir = tempfile::tempdir().unwrap();
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let state = McpServerState::open(dir.path().join("mcp-settings.json")).unwrap();
        state.set_port(port).unwrap();
        let error = bind_loopback(port).await.unwrap_err();
        assert!(error.contains("Could not start MCP"));
        assert!(!state.status().running);
    }

    #[tokio::test]
    async fn automatically_selected_port_is_persisted_for_restart() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("mcp-settings.json");
        let state = McpServerState::open(&path).unwrap();
        let selected = state.select_available_port().await.unwrap();
        assert_ne!(selected, 0);
        let restarted = McpServerState::open(path).unwrap();
        assert_eq!(restarted.status().port, selected);
        assert_eq!(restarted.status().endpoint, endpoint(selected));
    }
}
