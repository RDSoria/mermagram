use std::borrow::Cow;
use std::sync::Arc;

use http::request::Parts;
use rmcp::{
    ErrorData, RoleServer, ServerHandler,
    model::{
        CallToolRequestParams, CallToolResponse, CallToolResult, ContentBlock, Implementation,
        ListToolsResult, ProtocolVersion, ServerCapabilities, ServerConfig, Tool,
    },
    service::RequestContext,
};
use serde_json::{Value, json};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use uuid::Uuid;

use crate::{
    mcp_access::McpAccess, mcp_validation::ValidationBridge, workspace_store::WorkspaceStore,
};

#[derive(Clone)]
pub struct MermagramMcpHandler<R: Runtime = tauri::Wry> {
    app: AppHandle<R>,
    access: Arc<McpAccess>,
}

impl<R: Runtime> MermagramMcpHandler<R> {
    pub fn new(app: AppHandle<R>, access: Arc<McpAccess>) -> Self {
        Self { app, access }
    }

    fn tool_definitions() -> Vec<Tool> {
        vec![
            tool(
                "list_workspaces",
                "List workspace names, descriptions, and IDs to find a workspace to request.",
                json!({"type":"object","properties":{},"additionalProperties":false}),
            ),
            tool(
                "request_workspace_access",
                "Request user approval to bind this MCP connection to one workspace.",
                json!({"type":"object","properties":{"workspace_id":{"type":"string","format":"uuid"}},"required":["workspace_id"],"additionalProperties":false}),
            ),
            tool(
                "create_workspace",
                "Ask the user to approve creating a persistent workspace, then create it and bind this connection to it.",
                json!({"type":"object","properties":{"name":{"type":"string"},"description":{"type":"string"}},"required":["name","description"],"additionalProperties":false}),
            ),
            tool(
                "list_workspace_documents",
                "List documents in the workspace approved for this connection.",
                json!({"type":"object","properties":{},"additionalProperties":false}),
            ),
            tool(
                "read_workspace_document",
                "Read a Mermaid document from the approved workspace.",
                json!({"type":"object","properties":{"document_id":{"type":"string","format":"uuid"}},"required":["document_id"],"additionalProperties":false}),
            ),
            tool(
                "create_workspace_document",
                "Create a Mermaid document after validation and rendering succeed.",
                json!({"type":"object","properties":{"name":{"type":"string"},"code":{"type":"string"}},"required":["name","code"],"additionalProperties":false}),
            ),
            tool(
                "replace_workspace_document",
                "Atomically replace a complete Mermaid document after validation and rendering succeed.",
                json!({"type":"object","properties":{"document_id":{"type":"string","format":"uuid"},"code":{"type":"string"}},"required":["document_id","code"],"additionalProperties":false}),
            ),
        ]
    }

    async fn call(
        &self,
        request: CallToolRequestParams,
        context: RequestContext<RoleServer>,
    ) -> CallToolResponse {
        let session_id = match session_id(&context) {
            Ok(value) => value,
            Err(error) => return tool_error(error),
        };
        let args = request.arguments.unwrap_or_default();
        let result: Result<Value, String> = match request.name.as_ref() {
            "list_workspaces" => self.app.state::<WorkspaceStore>().list().map(|workspaces| {
                serde_json::to_value(
                    workspaces
                        .iter()
                        .map(|w| json!({"id":w.id,"name":w.name,"description":w.description}))
                        .collect::<Vec<_>>(),
                )
                .unwrap_or(Value::Null)
            }),
            "request_workspace_access" => {
                self.request_workspace_access(&session_id, &context, &args)
                    .await
            }
            "create_workspace" => self.create_workspace(&session_id, &context, &args).await,
            "list_workspace_documents" => self.list_documents(&session_id),
            "read_workspace_document" => self.read_document(&session_id, &args),
            "create_workspace_document" => self.create_document(&session_id, &args).await,
            "replace_workspace_document" => self.replace_document(&session_id, &args).await,
            _ => Err(format!("Unknown Mermagram tool: {}", request.name)),
        };
        match result {
            Ok(value) => {
                CallToolResult::success(vec![ContentBlock::text(value.to_string())]).into()
            }
            Err(error) => tool_error(error),
        }
    }

    async fn request_workspace_access(
        &self,
        session_id: &str,
        context: &RequestContext<RoleServer>,
        args: &serde_json::Map<String, Value>,
    ) -> Result<Value, String> {
        let workspace_id = parse_uuid(args, "workspace_id")?;
        if let Ok(current) = self.access.workspace_for(session_id) {
            return if current == workspace_id {
                Ok(json!({"workspace_id": current, "status":"already_approved"}))
            } else {
                Err("This MCP connection is already bound to another workspace. Reconnect to select a different workspace.".into())
            };
        }
        let workspace = self.app.state::<WorkspaceStore>().get(workspace_id)?;
        let client_name = context
            .client_info()
            .map(|info| info.name.to_string())
            .unwrap_or_else(|| "Unknown MCP client".into());
        let approved = self
            .access
            .request_approval(
                &self.app,
                session_id,
                client_name.clone(),
                Some(workspace.id),
                workspace.name.clone(),
                workspace.description.clone(),
                "connect",
            )
            .await?;
        if !approved {
            return Err("The user rejected workspace access".into());
        }
        self.access.bind(
            session_id,
            workspace.id,
            client_name.clone(),
            workspace.name.clone(),
        )?;
        let _ = self.app.emit(
            "mcp:connection-state",
            json!({"workspaceId":workspace.id,"workspaceName":workspace.name,"clientName":client_name,"connected":true}),
        );
        Ok(
            json!({"workspace_id":workspace.id,"status":"approved","message":"This connection is now scoped to this workspace."}),
        )
    }

    async fn create_workspace(
        &self,
        session_id: &str,
        context: &RequestContext<RoleServer>,
        args: &serde_json::Map<String, Value>,
    ) -> Result<Value, String> {
        if self.access.workspace_for(session_id).is_ok() {
            return Err("This connection is already bound to a workspace. Use a new connection to create or select another workspace.".into());
        }
        let name = required_string(args, "name")?;
        let description = required_string(args, "description")?;
        let client_name = context
            .client_info()
            .map(|info| info.name.to_string())
            .unwrap_or_else(|| "Unknown MCP client".into());
        let approved = self
            .access
            .request_approval(
                &self.app,
                session_id,
                client_name.clone(),
                None,
                name.clone(),
                description.clone(),
                "create",
            )
            .await?;
        if !approved {
            return Err("The user rejected workspace creation".into());
        }
        let workspace = self
            .app
            .state::<WorkspaceStore>()
            .create(name, description)?;
        self.access.bind(
            session_id,
            workspace.id,
            client_name.clone(),
            workspace.name.clone(),
        )?;
        let _ = self.app.emit(
            "mcp:connection-state",
            json!({"workspaceId":workspace.id,"workspaceName":workspace.name,"clientName":client_name,"connected":true}),
        );
        let _ = self.app.emit("mcp:workspace-created", &workspace);
        Ok(serde_json::to_value(workspace).unwrap_or(Value::Null))
    }

    fn list_documents(&self, session_id: &str) -> Result<Value, String> {
        let workspace_id = self.access.workspace_for(session_id)?;
        let workspace = self.app.state::<WorkspaceStore>().get(workspace_id)?;
        serde_json::to_value(workspace.documents).map_err(|error| error.to_string())
    }

    fn read_document(
        &self,
        session_id: &str,
        args: &serde_json::Map<String, Value>,
    ) -> Result<Value, String> {
        let workspace_id = self.access.workspace_for(session_id)?;
        let document_id = parse_uuid(args, "document_id")?;
        let document = self
            .app
            .state::<WorkspaceStore>()
            .get_document(workspace_id, document_id)?;
        serde_json::to_value(document).map_err(|error| error.to_string())
    }

    async fn create_document(
        &self,
        session_id: &str,
        args: &serde_json::Map<String, Value>,
    ) -> Result<Value, String> {
        let workspace_id = self.access.workspace_for(session_id)?;
        let name = required_string(args, "name")?;
        let code = required_string(args, "code")?;
        self.app
            .state::<ValidationBridge>()
            .validate_candidate(&self.app, code.clone())
            .await
            .map_err(|failure| serde_json::to_string(&failure).unwrap_or(failure.message))?;
        if self.access.workspace_for(session_id)? != workspace_id {
            return Err(
                "Workspace authorization changed during validation; retry after reconnecting."
                    .into(),
            );
        }
        let document =
            self.app
                .state::<WorkspaceStore>()
                .create_document(workspace_id, name, code)?;
        let _ = self.app.emit(
            "mcp:workspace-document-changed",
            json!({"workspaceId":workspace_id,"document":document}),
        );
        serde_json::to_value(document).map_err(|error| error.to_string())
    }

    async fn replace_document(
        &self,
        session_id: &str,
        args: &serde_json::Map<String, Value>,
    ) -> Result<Value, String> {
        let workspace_id = self.access.workspace_for(session_id)?;
        let document_id = parse_uuid(args, "document_id")?;
        let _write_guard = self.access.lock_document(document_id).await?;
        let code = required_string(args, "code")?;
        let document = self
            .app
            .state::<WorkspaceStore>()
            .get_document(workspace_id, document_id)?;
        if document.protected {
            return Err(
                "Document is protected by the user; ask them to remove protection before editing."
                    .into(),
            );
        }

        let _ = self.app.emit(
            "mcp:write-state",
            json!({"workspaceId":workspace_id,"documentId":document_id,"writing":true}),
        );
        let validation = self
            .app
            .state::<ValidationBridge>()
            .validate_candidate(&self.app, code.clone())
            .await
            .map_err(|failure| serde_json::to_string(&failure).unwrap_or(failure.message));
        let validation = validation.and_then(|()| {
            if self.access.workspace_for(session_id)? != workspace_id {
                return Err(
                    "Workspace authorization changed during validation; retry after reconnecting."
                        .into(),
                );
            }
            Ok(())
        });
        let result = validation.and_then(|()| {
            self.app
                .state::<WorkspaceStore>()
                .replace_document(workspace_id, document_id, code)
        });
        let _ = self.app.emit(
            "mcp:write-state",
            json!({"workspaceId":workspace_id,"documentId":document_id,"writing":false}),
        );
        let updated = result?;
        let _ = self.app.emit(
            "mcp:workspace-document-changed",
            json!({"workspaceId":workspace_id,"document":updated}),
        );
        serde_json::to_value(updated).map_err(|error| error.to_string())
    }
}

impl<R: Runtime> ServerHandler for MermagramMcpHandler<R> {
    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(Implementation::new("mermagram", env!("CARGO_PKG_VERSION")))
            .with_instructions("Mermagram local Mermaid workspaces. Ask the user to approve a workspace before editing. Writes replace a full document and are validated before application. A connection is scoped to one approved workspace.")
    }

    fn list_tools(
        &self,
        _request: Option<rmcp::model::PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> impl std::future::Future<Output = Result<ListToolsResult, ErrorData>> + Send + '_ {
        std::future::ready(Ok(
            ListToolsResult::with_all_items(Self::tool_definitions()),
        ))
    }

    fn supported_protocol_versions(&self) -> Cow<'static, [ProtocolVersion]> {
        Cow::Borrowed(&[ProtocolVersion::V_2025_11_25])
    }

    async fn call_tool(
        &self,
        request: CallToolRequestParams,
        context: RequestContext<RoleServer>,
    ) -> Result<CallToolResponse, ErrorData> {
        Ok(self.call(request, context).await)
    }
}

fn tool(name: &'static str, description: &'static str, schema: Value) -> Tool {
    Tool::new(
        name,
        description,
        schema.as_object().cloned().unwrap_or_default(),
    )
}

fn tool_error(message: String) -> CallToolResponse {
    CallToolResult::error(vec![ContentBlock::text(message)]).into()
}

fn session_id(context: &RequestContext<RoleServer>) -> Result<String, String> {
    context
        .extensions
        .get::<Parts>()
        .and_then(|parts| parts.headers.get("mcp-session-id"))
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned)
        .ok_or_else(|| "This MCP client has no active session. Reconnect and retry.".into())
}

fn required_string(args: &serde_json::Map<String, Value>, name: &str) -> Result<String, String> {
    args.get(name)
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| format!("Missing required string parameter: {name}"))
}

fn parse_uuid(args: &serde_json::Map<String, Value>, name: &str) -> Result<Uuid, String> {
    let raw = required_string(args, name)?;
    Uuid::parse_str(&raw).map_err(|_| format!("Parameter {name} must be a UUID"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace::WorkspaceDocument;
    use tauri::{Listener, Manager};

    #[test]
    fn exposes_workspace_and_document_tools() {
        let names = MermagramMcpHandler::<tauri::Wry>::tool_definitions()
            .into_iter()
            .map(|tool| tool.name.to_string())
            .collect::<Vec<_>>();
        assert!(names.contains(&"list_workspaces".to_string()));
        assert!(names.contains(&"request_workspace_access".to_string()));
        assert!(names.contains(&"create_workspace".to_string()));
        assert!(names.contains(&"read_workspace_document".to_string()));
        assert!(names.contains(&"replace_workspace_document".to_string()));
    }

    #[tokio::test]
    async fn workspace_document_validation_repair_protection_and_restart_flow() {
        let dir = tempfile::tempdir().unwrap();
        let store_path = dir.path().join("workspaces.json");
        let app = tauri::test::mock_app();
        app.manage(WorkspaceStore::open(&store_path).unwrap());
        app.manage(ValidationBridge::default());
        let access = Arc::new(McpAccess::default());
        let approval_access = access.clone();
        app.listen("mcp:approval-request", move |event| {
            let payload: Value = serde_json::from_str(event.payload()).unwrap();
            approval_access
                .decide(payload["requestId"].as_str().unwrap(), true)
                .unwrap();
        });

        let validation_app = app.handle().clone();
        app.listen("mcp:validate-candidate", move |event| {
            let payload: Value = serde_json::from_str(event.payload()).unwrap();
            let code = payload["code"].as_str().unwrap_or_default();
            let response = if code.contains("SYNTAX_ERROR") {
                crate::mcp_validation::ValidationResponse {
                    valid: false,
                    issues: vec![crate::mcp_validation::ValidationIssue {
                        message: "Unexpected token".into(),
                        line: Some(2),
                    }],
                }
            } else {
                crate::mcp_validation::ValidationResponse {
                    valid: true,
                    issues: vec![],
                }
            };
            validation_app
                .state::<ValidationBridge>()
                .complete(payload["request_id"].as_str().unwrap(), response)
                .unwrap();
        });

        let approved = access
            .request_approval(
                app.handle(),
                "integration-session",
                "Test agent".into(),
                None,
                "Integration workspace".into(),
                "E2E validation".into(),
                "create",
            )
            .await
            .unwrap();
        assert!(approved);
        let workspace = app
            .state::<WorkspaceStore>()
            .create("Integration workspace".into(), "E2E validation".into())
            .unwrap();
        access
            .bind(
                "integration-session",
                workspace.id,
                "Test agent".into(),
                workspace.name.clone(),
            )
            .unwrap();
        let handler = MermagramMcpHandler::new(app.handle().clone(), access.clone());
        let args = |pairs: &[(&str, Value)]| {
            pairs
                .iter()
                .map(|(key, value)| ((*key).to_owned(), value.clone()))
                .collect()
        };

        let created: WorkspaceDocument = serde_json::from_value(
            handler
                .create_document(
                    "integration-session",
                    &args(&[
                        ("name", json!("Diagram")),
                        ("code", json!("flowchart LR\n  A-->B")),
                    ]),
                )
                .await
                .unwrap(),
        )
        .unwrap();
        assert_eq!(
            handler
                .read_document(
                    "integration-session",
                    &args(&[("document_id", json!(created.id))])
                )
                .unwrap()["code"],
            "flowchart LR\n  A-->B"
        );

        let invalid = handler
            .replace_document(
                "integration-session",
                &args(&[
                    ("document_id", json!(created.id)),
                    ("code", json!("flowchart LR\nSYNTAX_ERROR")),
                ]),
            )
            .await
            .unwrap_err();
        assert!(invalid.contains("invalid_mermaid"));
        assert_eq!(
            app.state::<WorkspaceStore>()
                .get_document(workspace.id, created.id)
                .unwrap()
                .code,
            "flowchart LR\n  A-->B"
        );

        let repaired = handler
            .replace_document(
                "integration-session",
                &args(&[
                    ("document_id", json!(created.id)),
                    ("code", json!("flowchart LR\n  A-->C")),
                ]),
            )
            .await
            .unwrap();
        assert_eq!(repaired["code"], "flowchart LR\n  A-->C");

        app.state::<WorkspaceStore>()
            .set_protected(workspace.id, created.id, true)
            .unwrap();
        assert!(
            handler
                .replace_document(
                    "integration-session",
                    &args(&[
                        ("document_id", json!(created.id)),
                        ("code", json!("flowchart LR\n  A-->D")),
                    ])
                )
                .await
                .is_err()
        );
        access.unbind_session("integration-session");
        assert!(handler.list_documents("integration-session").is_err());
        access
            .bind(
                "reconnected-session",
                workspace.id,
                "Test agent".into(),
                workspace.name.clone(),
            )
            .unwrap();
        assert_eq!(
            handler.list_documents("reconnected-session").unwrap()[0]["protected"],
            true
        );

        drop(app);
        let reopened = WorkspaceStore::open(store_path).unwrap();
        assert_eq!(
            reopened
                .get_document(workspace.id, created.id)
                .unwrap()
                .code,
            "flowchart LR\n  A-->C"
        );
        assert!(
            reopened
                .get_document(workspace.id, created.id)
                .unwrap()
                .protected
        );
    }
}
