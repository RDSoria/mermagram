use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub const CURRENT_WORKSPACE_SCHEMA: u32 = 1;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceDocument {
    pub id: Uuid,
    pub name: String,
    pub code: String,
    pub protected: bool,
    pub revision: u64,
}

impl WorkspaceDocument {
    pub fn new(name: String, code: String) -> Self {
        Self {
            id: Uuid::new_v4(),
            name,
            code,
            protected: false,
            revision: 1,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub id: Uuid,
    pub name: String,
    pub description: String,
    pub documents: Vec<WorkspaceDocument>,
}

impl Workspace {
    pub fn new(name: String, description: String) -> Self {
        Self {
            id: Uuid::new_v4(),
            name,
            description,
            documents: Vec::new(),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceData {
    pub schema_version: u32,
    pub workspaces: Vec<Workspace>,
}

impl Default for WorkspaceData {
    fn default() -> Self {
        Self {
            schema_version: CURRENT_WORKSPACE_SCHEMA,
            workspaces: Vec::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn workspace_and_document_ids_are_unique_and_json_uses_camel_case() {
        let mut workspace = Workspace::new("Architecture".into(), "System overview".into());
        let first = WorkspaceDocument::new("Overview".into(), "flowchart LR".into());
        let second = WorkspaceDocument::new("Details".into(), "sequenceDiagram".into());
        assert_ne!(first.id, second.id);
        workspace.documents.extend([first, second]);

        let value = serde_json::to_value(WorkspaceData {
            schema_version: CURRENT_WORKSPACE_SCHEMA,
            workspaces: vec![workspace],
        })
        .unwrap();
        assert_eq!(value["schemaVersion"], CURRENT_WORKSPACE_SCHEMA);
        assert!(value["workspaces"][0]["documents"][0]["protected"].is_boolean());
        assert!(value["workspaces"][0]["documents"][0]["revision"].is_number());
    }
}
