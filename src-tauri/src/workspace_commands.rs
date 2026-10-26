use tauri::State;
use uuid::Uuid;

use crate::{
    mcp_server::McpServerState,
    workspace::{Workspace, WorkspaceDocument},
    workspace_store::WorkspaceStore,
};

#[tauri::command]
pub fn list_workspaces(store: State<'_, WorkspaceStore>) -> Result<Vec<Workspace>, String> {
    store.list()
}

#[tauri::command]
pub fn get_workspace(
    store: State<'_, WorkspaceStore>,
    workspace_id: Uuid,
) -> Result<Workspace, String> {
    store.get(workspace_id)
}

#[tauri::command]
pub fn create_workspace(
    store: State<'_, WorkspaceStore>,
    name: String,
    description: String,
) -> Result<Workspace, String> {
    store.create(name, description)
}

#[tauri::command]
pub fn create_workspace_document(
    store: State<'_, WorkspaceStore>,
    workspace_id: Uuid,
    name: String,
    code: String,
) -> Result<WorkspaceDocument, String> {
    store.create_document(workspace_id, name, code)
}

#[tauri::command]
pub fn get_workspace_document(
    store: State<'_, WorkspaceStore>,
    workspace_id: Uuid,
    document_id: Uuid,
) -> Result<WorkspaceDocument, String> {
    store.get_document(workspace_id, document_id)
}

#[tauri::command]
pub fn update_workspace_document_source(
    store: State<'_, WorkspaceStore>,
    mcp: State<'_, McpServerState>,
    workspace_id: Uuid,
    document_id: Uuid,
    code: String,
) -> Result<WorkspaceDocument, String> {
    let _write_guard = mcp.access.try_lock_document(document_id)?;
    store.update_document_source(workspace_id, document_id, code)
}

#[tauri::command]
pub fn rename_workspace_document(
    store: State<'_, WorkspaceStore>,
    mcp: State<'_, McpServerState>,
    workspace_id: Uuid,
    document_id: Uuid,
    name: String,
) -> Result<WorkspaceDocument, String> {
    let _write_guard = mcp.access.try_lock_document(document_id)?;
    store.rename_document(workspace_id, document_id, name)
}

#[tauri::command]
pub fn set_workspace_document_protected(
    store: State<'_, WorkspaceStore>,
    workspace_id: Uuid,
    document_id: Uuid,
    protected: bool,
) -> Result<WorkspaceDocument, String> {
    store.set_protected(workspace_id, document_id, protected)
}

#[tauri::command]
pub fn delete_workspace_document(
    store: State<'_, WorkspaceStore>,
    mcp: State<'_, McpServerState>,
    workspace_id: Uuid,
    document_id: Uuid,
) -> Result<(), String> {
    let _write_guard = mcp.access.try_lock_document(document_id)?;
    store.delete_document(workspace_id, document_id)
}

#[tauri::command]
pub fn delete_workspace(
    store: State<'_, WorkspaceStore>,
    mcp: State<'_, McpServerState>,
    workspace_id: Uuid,
) -> Result<(), String> {
    store.delete(workspace_id)?;
    mcp.access.revoke_workspace(workspace_id);
    Ok(())
}
