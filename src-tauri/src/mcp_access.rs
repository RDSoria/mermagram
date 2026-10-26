use std::{
    collections::HashMap,
    sync::{
        Mutex,
        atomic::{AtomicU64, Ordering},
    },
    time::Duration,
};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Runtime};
use tokio::sync::oneshot;
use tokio::sync::{Mutex as AsyncMutex, OwnedMutexGuard};
use uuid::Uuid;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalRequest {
    pub request_id: String,
    pub client_name: String,
    pub workspace_id: Option<Uuid>,
    pub workspace_name: String,
    pub workspace_description: String,
    pub action: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientBinding {
    pub client_name: String,
    pub workspace_id: Uuid,
    pub workspace_name: String,
}

#[derive(Default)]
pub struct McpAccess {
    next_id: AtomicU64,
    pending: Mutex<HashMap<String, oneshot::Sender<bool>>>,
    pending_by_session: Mutex<HashMap<String, String>>,
    bindings: Mutex<HashMap<String, ClientBinding>>,
    write_locks: Mutex<HashMap<Uuid, std::sync::Arc<AsyncMutex<()>>>>,
}

impl McpAccess {
    pub async fn request_approval<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        session_id: &str,
        client_name: String,
        workspace_id: Option<Uuid>,
        workspace_name: String,
        workspace_description: String,
        action: &str,
    ) -> Result<bool, String> {
        let request_id = format!(
            "mcp-approval-{}",
            self.next_id.fetch_add(1, Ordering::Relaxed)
        );
        {
            let mut by_session = self
                .pending_by_session
                .lock()
                .map_err(|_| "MCP approvals are unavailable")?;
            if by_session.contains_key(session_id) {
                return Err(
                    "This connection already has a pending workspace approval request".into(),
                );
            }
            by_session.insert(session_id.to_owned(), request_id.clone());
        }
        let (sender, receiver) = oneshot::channel();
        self.pending
            .lock()
            .map_err(|_| "MCP approvals are unavailable")?
            .insert(request_id.clone(), sender);
        let request = ApprovalRequest {
            request_id: request_id.clone(),
            client_name,
            workspace_id,
            workspace_name,
            workspace_description,
            action: action.to_string(),
        };
        if let Err(error) = app.emit("mcp:approval-request", request) {
            self.pending
                .lock()
                .ok()
                .map(|mut pending| pending.remove(&request_id));
            self.clear_pending_session(session_id, &request_id);
            return Err(format!(
                "Could not show workspace approval request: {error}"
            ));
        }

        let result = match tokio::time::timeout(Duration::from_secs(180), receiver).await {
            Ok(Ok(true)) => Ok(true),
            Ok(Ok(false)) => Ok(false),
            Ok(Err(_)) => Err("Workspace approval request was cancelled".into()),
            Err(_) => {
                self.pending
                    .lock()
                    .ok()
                    .map(|mut pending| pending.remove(&request_id));
                Err("Workspace approval request timed out".into())
            }
        };
        self.clear_pending_session(session_id, &request_id);
        result
    }

    fn clear_pending_session(&self, session_id: &str, request_id: &str) {
        if let Ok(mut by_session) = self.pending_by_session.lock() {
            if by_session
                .get(session_id)
                .is_some_and(|current| current == request_id)
            {
                by_session.remove(session_id);
            }
        }
    }

    pub fn bind(
        &self,
        session_id: &str,
        workspace_id: Uuid,
        client_name: String,
        workspace_name: String,
    ) -> Result<(), String> {
        self.bindings
            .lock()
            .map_err(|_| "MCP client bindings are unavailable")?
            .insert(
                session_id.to_string(),
                ClientBinding {
                    client_name,
                    workspace_id,
                    workspace_name,
                },
            );
        Ok(())
    }

    pub fn workspace_for(&self, session_id: &str) -> Result<Uuid, String> {
        self.bindings
            .lock()
            .map_err(|_| "MCP client bindings are unavailable")?
            .get(session_id)
            .map(|binding| binding.workspace_id)
            .ok_or_else(|| "Request workspace access before using workspace tools".into())
    }

    pub fn clients(&self) -> Result<Vec<ClientBinding>, String> {
        self.bindings
            .lock()
            .map(|bindings| bindings.values().cloned().collect())
            .map_err(|_| "MCP client bindings are unavailable".into())
    }

    pub fn unbind_session(&self, session_id: &str) -> Option<ClientBinding> {
        if let Ok(mut bindings) = self.bindings.lock() {
            return bindings.remove(session_id);
        }
        None
    }

    pub fn revoke_workspace(&self, workspace_id: Uuid) {
        if let Ok(mut bindings) = self.bindings.lock() {
            bindings.retain(|_, binding| binding.workspace_id != workspace_id);
        }
    }

    pub async fn lock_document(&self, document_id: Uuid) -> Result<OwnedMutexGuard<()>, String> {
        let lock = {
            let mut locks = self
                .write_locks
                .lock()
                .map_err(|_| "MCP write locks are unavailable")?;
            locks
                .entry(document_id)
                .or_insert_with(|| std::sync::Arc::new(AsyncMutex::new(())))
                .clone()
        };
        Ok(lock.lock_owned().await)
    }

    pub fn try_lock_document(&self, document_id: Uuid) -> Result<OwnedMutexGuard<()>, String> {
        let lock = {
            let mut locks = self
                .write_locks
                .lock()
                .map_err(|_| "MCP write locks are unavailable")?;
            locks
                .entry(document_id)
                .or_insert_with(|| std::sync::Arc::new(AsyncMutex::new(())))
                .clone()
        };
        lock.try_lock_owned().map_err(|_| {
            "This document is temporarily locked while an agent write is being validated".into()
        })
    }

    pub fn clear(&self) {
        if let Ok(mut bindings) = self.bindings.lock() {
            bindings.clear();
        }
        if let Ok(mut pending) = self.pending.lock() {
            pending.clear();
        }
        if let Ok(mut pending) = self.pending_by_session.lock() {
            pending.clear();
        }
    }

    pub fn decide(&self, request_id: &str, approved: bool) -> Result<(), String> {
        let sender = self
            .pending
            .lock()
            .map_err(|_| "MCP approvals are unavailable")?
            .remove(request_id)
            .ok_or_else(|| "Approval request is no longer active".to_string())?;
        sender
            .send(approved)
            .map_err(|_| "Approval request has already timed out".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn bindings_are_per_session_and_revoke_with_workspace() {
        let access = McpAccess::default();
        let workspace_a = Uuid::new_v4();
        let workspace_b = Uuid::new_v4();
        access
            .bind("session-a", workspace_a, "a".into(), "A".into())
            .unwrap();
        access
            .bind("session-b", workspace_b, "b".into(), "B".into())
            .unwrap();
        assert_eq!(access.workspace_for("session-a").unwrap(), workspace_a);
        assert_eq!(access.workspace_for("session-b").unwrap(), workspace_b);
        access.revoke_workspace(workspace_a);
        assert!(access.workspace_for("session-a").is_err());
        assert_eq!(access.workspace_for("session-b").unwrap(), workspace_b);
    }

    #[tokio::test]
    async fn pending_approval_returns_user_decision() {
        let access = McpAccess::default();
        let (sender, receiver) = oneshot::channel();
        access
            .pending
            .lock()
            .unwrap()
            .insert("request-1".into(), sender);
        access.decide("request-1", true).unwrap();
        assert!(receiver.await.unwrap());
        assert!(access.decide("request-1", false).is_err());
    }

    #[tokio::test]
    async fn concurrent_document_writes_are_serialized() {
        let access = std::sync::Arc::new(McpAccess::default());
        let document_id = Uuid::new_v4();
        let first = access.lock_document(document_id).await.unwrap();
        let second_access = access.clone();
        let (acquired, mut receiver) = tokio::sync::oneshot::channel();
        let second = tokio::spawn(async move {
            let _guard = second_access.lock_document(document_id).await.unwrap();
            let _ = acquired.send(());
        });
        assert!(
            tokio::time::timeout(Duration::from_millis(15), &mut receiver)
                .await
                .is_err()
        );
        drop(first);
        tokio::time::timeout(Duration::from_millis(250), &mut receiver)
            .await
            .unwrap()
            .unwrap();
        second.await.unwrap();
    }

    #[test]
    fn disconnect_unbinds_only_that_session() {
        let access = McpAccess::default();
        let a = Uuid::new_v4();
        let b = Uuid::new_v4();
        access.bind("a", a, "a".into(), "A".into()).unwrap();
        access.bind("b", b, "b".into(), "B".into()).unwrap();
        access.unbind_session("a");
        assert!(access.workspace_for("a").is_err());
        assert_eq!(access.workspace_for("b").unwrap(), b);
    }

    #[test]
    fn unapproved_sessions_have_no_workspace_access() {
        let access = McpAccess::default();
        assert!(access.workspace_for("unapproved-session").is_err());
        assert!(access.clients().unwrap().is_empty());
    }

    #[test]
    fn server_shutdown_clears_sessions_and_pending_approvals() {
        let access = McpAccess::default();
        let (sender, _receiver) = oneshot::channel();
        access
            .pending
            .lock()
            .unwrap()
            .insert("pending".into(), sender);
        access
            .bind(
                "connected",
                Uuid::new_v4(),
                "Agent".into(),
                "Workspace".into(),
            )
            .unwrap();
        access.clear();
        assert!(access.workspace_for("connected").is_err());
        assert!(access.clients().unwrap().is_empty());
        assert!(access.decide("pending", true).is_err());
    }
}
