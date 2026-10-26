import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { validateAndRenderCandidate, type MermaidIssue } from "../core/mermaid";

interface ValidationRequest {
  request_id: string;
  code: string;
}

interface ValidationResponse {
  valid: boolean;
  issues: MermaidIssue[];
}

/** Bridges backend MCP write validation through the editor's Mermaid runtime. */
export async function initMcpValidationBridge(): Promise<UnlistenFn> {
  return listen<ValidationRequest>("mcp:validate-candidate", async ({ payload }) => {
    let response: ValidationResponse;
    try {
      const result = await validateAndRenderCandidate(payload.code);
      response = result.valid
        ? { valid: true, issues: [] }
        : { valid: false, issues: result.issues };
    } catch (error) {
      response = {
        valid: false,
        issues: [{ message: error instanceof Error ? error.message : String(error) }],
      };
    }

    try {
      await invoke("complete_mcp_validation", {
        requestId: payload.request_id,
        response,
      });
    } catch (error) {
      console.error("Could not return Mermaid validation result to MCP server.", error);
    }
  });
}
