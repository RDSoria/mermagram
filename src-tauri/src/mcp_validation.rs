use std::{
    collections::HashMap,
    sync::{
        Mutex,
        atomic::{AtomicU64, Ordering},
    },
    time::Duration,
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Runtime, State};
use tokio::sync::oneshot;

const VALIDATION_TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ValidationIssue {
    pub message: String,
    pub line: Option<u32>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ValidationResponse {
    pub valid: bool,
    pub issues: Vec<ValidationIssue>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationFailure {
    pub code: String,
    pub message: String,
    pub issues: Vec<ValidationIssue>,
}

#[derive(Clone, Debug, Serialize)]
struct ValidationRequest {
    request_id: String,
    code: String,
}

#[derive(Default)]
pub struct ValidationBridge {
    next_id: AtomicU64,
    pending: Mutex<HashMap<String, oneshot::Sender<ValidationResponse>>>,
}

impl ValidationBridge {
    pub async fn validate_candidate<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        code: String,
    ) -> Result<(), ValidationFailure> {
        let request_id = format!(
            "mcp-validation-{}",
            self.next_id.fetch_add(1, Ordering::Relaxed)
        );
        let (sender, receiver) = oneshot::channel();
        self.pending
            .lock()
            .map_err(|_| {
                validation_failure(
                    "bridge_unavailable",
                    "Validation bridge is unavailable",
                    vec![],
                )
            })?
            .insert(request_id.clone(), sender);

        if let Err(error) = app.emit(
            "mcp:validate-candidate",
            ValidationRequest {
                request_id: request_id.clone(),
                code,
            },
        ) {
            self.remove_pending(&request_id);
            return Err(validation_failure(
                "bridge_unavailable",
                &format!("Could not request Mermaid validation: {error}"),
                vec![],
            ));
        }

        match tokio::time::timeout(VALIDATION_TIMEOUT, receiver).await {
            Ok(Ok(response)) if response.valid => Ok(()),
            Ok(Ok(response)) => Err(validation_failure(
                "invalid_mermaid",
                &format_issues(&response.issues),
                response.issues,
            )),
            Ok(Err(_)) => Err(validation_failure(
                "bridge_unavailable",
                "Mermaid validation response was dropped",
                vec![],
            )),
            Err(_) => {
                self.remove_pending(&request_id);
                Err(validation_failure(
                    "validation_timeout",
                    "Mermaid validation timed out; the document was not changed",
                    vec![],
                ))
            }
        }
    }

    fn remove_pending(&self, request_id: &str) {
        if let Ok(mut pending) = self.pending.lock() {
            pending.remove(request_id);
        }
    }

    pub(crate) fn complete(
        &self,
        request_id: &str,
        response: ValidationResponse,
    ) -> Result<(), String> {
        let sender = self
            .pending
            .lock()
            .map_err(|_| "Validation bridge is unavailable".to_string())?
            .remove(request_id)
            .ok_or_else(|| "Validation request is no longer active".to_string())?;
        sender
            .send(response)
            .map_err(|_| "Validation request has already timed out".to_string())
    }
}

fn validation_failure(
    code: &str,
    message: &str,
    issues: Vec<ValidationIssue>,
) -> ValidationFailure {
    ValidationFailure {
        code: code.into(),
        message: message.into(),
        issues,
    }
}

fn format_issues(issues: &[ValidationIssue]) -> String {
    if issues.is_empty() {
        return "Mermaid validation or rendering failed".to_string();
    }
    issues
        .iter()
        .map(|issue| match issue.line {
            Some(line) => format!("Line {line}: {}", issue.message),
            None => issue.message.clone(),
        })
        .collect::<Vec<_>>()
        .join("\n")
}

#[tauri::command]
pub fn complete_mcp_validation(
    state: State<'_, ValidationBridge>,
    request_id: String,
    response: ValidationResponse,
) -> Result<(), String> {
    state.complete(&request_id, response)
}
