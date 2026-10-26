use std::{
    fs::{self, File},
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
};

use tempfile::NamedTempFile;
use uuid::Uuid;

use crate::workspace::{CURRENT_WORKSPACE_SCHEMA, Workspace, WorkspaceData, WorkspaceDocument};

pub struct WorkspaceStore {
    path: PathBuf,
    data: Mutex<WorkspaceData>,
}

impl WorkspaceStore {
    pub fn open(path: impl Into<PathBuf>) -> Result<Self, String> {
        let path = path.into();
        let data = if path.exists() {
            let file = File::open(&path)
                .map_err(|error| format!("Could not open workspace store: {error}"))?;
            let loaded: WorkspaceData = serde_json::from_reader(file)
                .map_err(|error| format!("Workspace store is not valid JSON: {error}"))?;
            if loaded.schema_version != CURRENT_WORKSPACE_SCHEMA {
                return Err(format!(
                    "Unsupported workspace store schema {}; expected {}",
                    loaded.schema_version, CURRENT_WORKSPACE_SCHEMA
                ));
            }
            loaded
        } else {
            WorkspaceData::default()
        };
        Ok(Self {
            path,
            data: Mutex::new(data),
        })
    }

    pub fn list(&self) -> Result<Vec<Workspace>, String> {
        self.data
            .lock()
            .map(|data| data.workspaces.clone())
            .map_err(|_| "Workspace store is unavailable".to_string())
    }

    pub fn get(&self, id: Uuid) -> Result<Workspace, String> {
        self.data
            .lock()
            .map_err(|_| "Workspace store is unavailable".to_string())?
            .workspaces
            .iter()
            .find(|workspace| workspace.id == id)
            .cloned()
            .ok_or_else(|| "Workspace not found".to_string())
    }

    pub fn create(&self, name: String, description: String) -> Result<Workspace, String> {
        self.mutate(|data| {
            let workspace = Workspace::new(name, description);
            data.workspaces.push(workspace.clone());
            Ok(workspace)
        })
    }

    pub fn create_document(
        &self,
        workspace_id: Uuid,
        name: String,
        code: String,
    ) -> Result<WorkspaceDocument, String> {
        self.mutate(|data| {
            let workspace = data
                .workspaces
                .iter_mut()
                .find(|workspace| workspace.id == workspace_id)
                .ok_or_else(|| "Workspace not found".to_string())?;
            let document = WorkspaceDocument::new(name, code);
            workspace.documents.push(document.clone());
            Ok(document)
        })
    }

    pub fn get_document(
        &self,
        workspace_id: Uuid,
        document_id: Uuid,
    ) -> Result<WorkspaceDocument, String> {
        self.data
            .lock()
            .map_err(|_| "Workspace store is unavailable".to_string())?
            .workspaces
            .iter()
            .find(|workspace| workspace.id == workspace_id)
            .and_then(|workspace| {
                workspace
                    .documents
                    .iter()
                    .find(|document| document.id == document_id)
            })
            .cloned()
            .ok_or_else(|| "Workspace document not found".to_string())
    }

    pub fn replace_document(
        &self,
        workspace_id: Uuid,
        document_id: Uuid,
        code: String,
    ) -> Result<WorkspaceDocument, String> {
        self.mutate(|data| {
            let document = data
                .workspaces
                .iter_mut()
                .find(|workspace| workspace.id == workspace_id)
                .and_then(|workspace| {
                    workspace
                        .documents
                        .iter_mut()
                        .find(|doc| doc.id == document_id)
                })
                .ok_or_else(|| "Workspace document not found".to_string())?;
            if document.protected {
                return Err("Document is protected from agent edits".to_string());
            }
            document.code = code;
            document.revision = document.revision.saturating_add(1);
            Ok(document.clone())
        })
    }

    pub fn update_document_source(
        &self,
        workspace_id: Uuid,
        document_id: Uuid,
        code: String,
    ) -> Result<WorkspaceDocument, String> {
        self.mutate(|data| {
            let document = data
                .workspaces
                .iter_mut()
                .find(|workspace| workspace.id == workspace_id)
                .and_then(|workspace| {
                    workspace
                        .documents
                        .iter_mut()
                        .find(|doc| doc.id == document_id)
                })
                .ok_or_else(|| "Workspace document not found".to_string())?;
            document.code = code;
            document.revision = document.revision.saturating_add(1);
            Ok(document.clone())
        })
    }

    pub fn rename_document(
        &self,
        workspace_id: Uuid,
        document_id: Uuid,
        name: String,
    ) -> Result<WorkspaceDocument, String> {
        let name = name.trim().to_string();
        if name.is_empty() {
            return Err("Workspace document name cannot be empty".to_string());
        }
        if name.chars().count() > 160 {
            return Err("Workspace document name cannot exceed 160 characters".to_string());
        }
        self.mutate(|data| {
            let document = data
                .workspaces
                .iter_mut()
                .find(|workspace| workspace.id == workspace_id)
                .and_then(|workspace| {
                    workspace
                        .documents
                        .iter_mut()
                        .find(|doc| doc.id == document_id)
                })
                .ok_or_else(|| "Workspace document not found".to_string())?;
            document.name = name;
            document.revision = document.revision.saturating_add(1);
            Ok(document.clone())
        })
    }

    pub fn set_protected(
        &self,
        workspace_id: Uuid,
        document_id: Uuid,
        protected: bool,
    ) -> Result<WorkspaceDocument, String> {
        self.mutate(|data| {
            let document = data
                .workspaces
                .iter_mut()
                .find(|workspace| workspace.id == workspace_id)
                .and_then(|workspace| {
                    workspace
                        .documents
                        .iter_mut()
                        .find(|doc| doc.id == document_id)
                })
                .ok_or_else(|| "Workspace document not found".to_string())?;
            document.protected = protected;
            Ok(document.clone())
        })
    }

    pub fn delete_document(&self, workspace_id: Uuid, document_id: Uuid) -> Result<(), String> {
        self.mutate(|data| {
            let workspace = data
                .workspaces
                .iter_mut()
                .find(|workspace| workspace.id == workspace_id)
                .ok_or_else(|| "Workspace not found".to_string())?;
            let before = workspace.documents.len();
            workspace
                .documents
                .retain(|document| document.id != document_id);
            if workspace.documents.len() == before {
                return Err("Workspace document not found".into());
            }
            Ok(())
        })
    }

    pub fn delete(&self, workspace_id: Uuid) -> Result<(), String> {
        self.mutate(|data| {
            let before = data.workspaces.len();
            data.workspaces
                .retain(|workspace| workspace.id != workspace_id);
            if data.workspaces.len() == before {
                return Err("Workspace not found".to_string());
            }
            Ok(())
        })
    }

    fn mutate<T>(
        &self,
        operation: impl FnOnce(&mut WorkspaceData) -> Result<T, String>,
    ) -> Result<T, String> {
        let mut guard = self
            .data
            .lock()
            .map_err(|_| "Workspace store is unavailable".to_string())?;
        let mut next = guard.clone();
        let result = operation(&mut next)?;
        persist_atomically(&self.path, &next)?;
        *guard = next;
        Ok(result)
    }
}

fn persist_atomically(path: &Path, data: &WorkspaceData) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Workspace store path has no parent".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Could not create app data directory: {error}"))?;
    let mut temp = NamedTempFile::new_in(parent)
        .map_err(|error| format!("Could not create temporary workspace store: {error}"))?;
    serde_json::to_writer(&mut temp, data)
        .map_err(|error| format!("Could not serialize workspace store: {error}"))?;
    temp.write_all(b"\n")
        .map_err(|error| format!("Could not finish workspace store: {error}"))?;
    temp.as_file()
        .sync_all()
        .map_err(|error| format!("Could not flush workspace store: {error}"))?;
    temp.persist(path).map_err(|error| {
        format!(
            "Could not commit workspace store atomically: {}",
            error.error
        )
    })?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn workspaces_survive_reopening_the_store() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("workspaces.json");
        let workspace_id;
        let document_id;
        {
            let store = WorkspaceStore::open(&path).unwrap();
            let workspace = store
                .create("Payments".into(), "Payment architecture diagrams".into())
                .unwrap();
            let document = store
                .create_document(workspace.id, "Overview".into(), "flowchart LR".into())
                .unwrap();
            workspace_id = workspace.id;
            document_id = document.id;
            store
                .set_protected(workspace_id, document_id, true)
                .unwrap();
        }

        let reopened = WorkspaceStore::open(&path).unwrap();
        let workspace = reopened.get(workspace_id).unwrap();
        let document = reopened.get_document(workspace_id, document_id).unwrap();
        assert_eq!(workspace.description, "Payment architecture diagrams");
        assert_eq!(document.code, "flowchart LR");
        assert!(document.protected);
    }

    #[test]
    fn failed_mutation_does_not_change_in_memory_state() {
        let dir = tempfile::tempdir().unwrap();
        let blocker = dir.path().join("not-a-directory");
        fs::write(&blocker, "file").unwrap();
        let store = WorkspaceStore::open(blocker.join("workspaces.json")).unwrap();
        assert!(store.create("Not committed".into(), "".into()).is_err());
        assert!(store.list().unwrap().is_empty());
    }

    #[test]
    fn malformed_or_unsupported_store_is_not_overwritten() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("workspaces.json");
        let original = br#"{"schemaVersion":0,"workspaces":[]}"#;
        fs::write(&path, original).unwrap();
        assert!(WorkspaceStore::open(&path).is_err());
        assert_eq!(fs::read(&path).unwrap(), original);

        fs::write(&path, b"not json").unwrap();
        assert!(WorkspaceStore::open(&path).is_err());
        assert_eq!(fs::read(&path).unwrap(), b"not json");
    }

    #[test]
    fn deletion_is_persisted() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("workspaces.json");
        let store = WorkspaceStore::open(&path).unwrap();
        let workspace = store.create("Temporary".into(), "".into()).unwrap();
        store.delete(workspace.id).unwrap();
        assert!(
            WorkspaceStore::open(path)
                .unwrap()
                .list()
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn replacing_protected_document_is_rejected_and_preserves_source() {
        let dir = tempfile::tempdir().unwrap();
        let store = WorkspaceStore::open(dir.path().join("workspaces.json")).unwrap();
        let workspace = store.create("Protected".into(), "".into()).unwrap();
        let document = store
            .create_document(workspace.id, "Diagram".into(), "flowchart LR".into())
            .unwrap();
        store
            .set_protected(workspace.id, document.id, true)
            .unwrap();
        assert!(
            store
                .replace_document(workspace.id, document.id, "sequenceDiagram".into())
                .is_err()
        );
        assert_eq!(
            store.get_document(workspace.id, document.id).unwrap().code,
            "flowchart LR"
        );
    }

    #[test]
    fn document_cannot_be_read_or_replaced_through_another_workspace() {
        let dir = tempfile::tempdir().unwrap();
        let store = WorkspaceStore::open(dir.path().join("workspaces.json")).unwrap();
        let first = store.create("First".into(), "".into()).unwrap();
        let second = store.create("Second".into(), "".into()).unwrap();
        let document = store
            .create_document(first.id, "Private".into(), "flowchart LR".into())
            .unwrap();

        assert!(store.get_document(second.id, document.id).is_err());
        assert!(
            store
                .replace_document(second.id, document.id, "sequenceDiagram".into())
                .is_err()
        );
        assert_eq!(
            store.get_document(first.id, document.id).unwrap().code,
            "flowchart LR"
        );
    }

    #[test]
    fn deleting_document_is_persisted_without_deleting_workspace() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("workspaces.json");
        let store = WorkspaceStore::open(&path).unwrap();
        let workspace = store.create("Keep workspace".into(), "".into()).unwrap();
        let document = store
            .create_document(workspace.id, "Remove me".into(), "flowchart LR".into())
            .unwrap();
        store.delete_document(workspace.id, document.id).unwrap();

        let reopened = WorkspaceStore::open(path).unwrap();
        assert!(reopened.get_document(workspace.id, document.id).is_err());
        assert!(reopened.get(workspace.id).unwrap().documents.is_empty());
    }

    #[test]
    fn renaming_document_persists_name_and_rejects_empty_names() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("workspaces.json");
        let store = WorkspaceStore::open(&path).unwrap();
        let workspace = store.create("Workspace".into(), String::new()).unwrap();
        let document = store
            .create_document(workspace.id, "Untitled".into(), "flowchart LR".into())
            .unwrap();

        let renamed = store
            .rename_document(workspace.id, document.id, "  Diagram  ".into())
            .unwrap();
        assert_eq!(renamed.name, "Diagram");
        assert!(
            store
                .rename_document(workspace.id, document.id, "   ".into())
                .is_err()
        );
        assert_eq!(
            WorkspaceStore::open(path)
                .unwrap()
                .get_document(workspace.id, document.id)
                .unwrap()
                .name,
            "Diagram"
        );
    }
}
