import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { t } from "../core/i18n";
import { showToast } from "./toast";

interface McpStatus {
  running: boolean;
  port: number;
  endpoint: string;
  error: string | null;
}

interface ApprovalRequest {
  requestId: string;
  clientName: string;
  workspaceId: string | null;
  workspaceName: string;
  workspaceDescription: string;
  action: "connect" | "create";
}

interface ClientBinding {
  clientName: string;
  workspaceId: string;
  workspaceName: string;
}

export async function initMcp(): Promise<UnlistenFn[]> {
  const toggle = required<HTMLButtonElement>("mcp-toggle");
  const dialog = required<HTMLDialogElement>("mcp-approval-dialog");
  const queue: ApprovalRequest[] = [];
  const clients = new Map<string, ClientBinding>();
  let connectionRevision = 0;
  let activeApproval: ApprovalRequest | null = null;
  let status = await invoke<McpStatus>("get_mcp_status");

  const renderStatus = (next: McpStatus): void => {
    status = next;
    required("mcp-error-status").hidden = true;
    toggle.dataset.state = next.running ? "running" : "stopped";
    toggle.setAttribute("aria-pressed", String(next.running));
    toggle.setAttribute("aria-label", `${t("mcpLabel")}: ${t(next.running ? "mcpStatusRunning" : "mcpStatusStopped")}`);
    toggle.title = t(next.running ? "mcpStop" : "mcpStart");
    required("mcp-settings-status").textContent = t(next.running ? "mcpRunning" : "mcpStopped");
    required<HTMLInputElement>("mcp-port").value = String(next.port);
    required<HTMLInputElement>("mcp-endpoint").value = next.endpoint;
    if (!next.running) clients.clear();
    renderConnections();
  };

  const renderConnections = (): void => {
    const list = required<HTMLUListElement>("mcp-connection-list");
    const entries = [...clients.entries()];
    required("mcp-connection-status").textContent = entries.length === 0
      ? t("mcpNoClients")
      : t("mcpClientConnected", { workspace: entries.map(([, entry]) => `${entry.clientName} → ${entry.workspaceName}`).join(" · ") });
    list.replaceChildren();
    entries.forEach(([, entry]) => {
      const item = document.createElement("li");
      item.textContent = `${entry.clientName} — ${entry.workspaceName}`;
      list.append(item);
    });
  };

  const renderPending = (): void => {
    required("mcp-pending-status").textContent = t("mcpPendingApprovals", { count: queue.length + (activeApproval ? 1 : 0) });
  };

  const renderApproval = (): void => {
    if (dialog.open || activeApproval || queue.length === 0) return;
    activeApproval = queue.shift()!;
    renderPending();
    const approval = activeApproval;
    required("mcp-approval-agent").textContent = approval.clientName;
    required("mcp-approval-workspace").textContent = approval.workspaceName;
    required("mcp-approval-description").textContent = approval.workspaceDescription || "—";
    required("mcp-approval-copy").textContent = approval.action === "create"
      ? t("mcpApprovalCreateCopy")
      : t("mcpApprovalCopy");
    required("mcp-approval-scope").textContent = t("mcpReadWriteScope");
    dialog.showModal();
  };

  const decide = async (approved: boolean): Promise<void> => {
    if (!activeApproval) return;
    try {
      await invoke("decide_mcp_approval", { requestId: activeApproval.requestId, approved });
      required("mcp-error-status").hidden = true;
    } catch {
      showToast(t("mcpApprovalFailed"), "error");
    } finally {
      activeApproval = null;
      renderPending();
      if (dialog.open) dialog.close();
      queueMicrotask(renderApproval);
    }
  };

  renderStatus(status);
  const unlistenStatus = await listen<McpStatus>("mcp:status", ({ payload }) => renderStatus(payload));
  const unlistenApproval = await listen<ApprovalRequest>("mcp:approval-request", ({ payload }) => {
    queue.push(payload);
    renderPending();
    renderApproval();
  });
  const unlistenCreated = await listen("mcp:workspace-created", async () => {
    // Workspace-tab integration attaches here; refreshing avoids losing a workspace
    // when the MCP server is connected before navigation is entered.
    window.dispatchEvent(new CustomEvent("mermagram:workspaces-changed"));
  });
  const unlistenConnection = await listen<ClientBinding & { connected: boolean }>("mcp:connection-state", ({ payload }) => {
    connectionRevision += 1;
    const key = `${payload.clientName}:${payload.workspaceId}`;
    if (payload.connected) clients.set(key, payload);
    else clients.delete(key);
    renderConnections();
  });
  const observedRevision = connectionRevision;
  void invoke<ClientBinding[]>("get_mcp_connections").then((items) => {
    if (connectionRevision !== observedRevision) return;
    clients.clear();
    items.forEach((item) => clients.set(`${item.clientName}:${item.workspaceId}`, item));
    renderConnections();
  }).catch((error) => {
    required("mcp-error-status").textContent = t("mcpServerError", { error: String(error) });
    required("mcp-error-status").hidden = false;
  });

  toggle.addEventListener("click", async () => {
    toggle.disabled = true;
    try {
      const next = await invoke<McpStatus>(status.running ? "stop_mcp_server" : "start_mcp_server");
      renderStatus(next);
    } catch (error) {
      required("mcp-error-status").textContent = t("mcpServerError", { error: String(error) });
      required("mcp-error-status").hidden = false;
      showToast(String(error), "error");
    } finally {
      toggle.disabled = false;
    }
  });

  required<HTMLButtonElement>("mcp-save-port").addEventListener("click", async () => {
    const port = Number(required<HTMLInputElement>("mcp-port").value);
    try {
      renderStatus(await invoke<McpStatus>("set_mcp_port", { port }));
      showToast(t("mcpPortSaved"), "success");
    } catch (error) {
      showToast(String(error), "error");
    }
  });
  required<HTMLButtonElement>("mcp-auto-port").addEventListener("click", async () => {
    try {
      renderStatus(await invoke<McpStatus>("select_mcp_port"));
      required("mcp-error-status").hidden = true;
      showToast(t("mcpPortSaved"), "success");
    } catch (error) {
      required("mcp-error-status").textContent = t("mcpServerError", { error: String(error) });
      required("mcp-error-status").hidden = false;
      showToast(String(error), "error");
    }
  });
  required<HTMLButtonElement>("mcp-copy-endpoint").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(status.endpoint);
      showToast(t("mcpCopySuccess"), "success");
    } catch (error) {
      showToast(String(error), "error");
    }
  });
  required<HTMLButtonElement>("mcp-approval-approve").addEventListener("click", () => void decide(true));
  required<HTMLButtonElement>("mcp-approval-reject").addEventListener("click", () => void decide(false));
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    void decide(false);
  });

  return [unlistenStatus, unlistenApproval, unlistenCreated, unlistenConnection];
}

function required<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
}
