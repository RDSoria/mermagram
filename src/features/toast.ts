export type ToastKind = "success" | "error" | "info";

const GLYPH: Record<ToastKind, string> = {
  success: "✓",
  error: "!",
  info: "i",
};

export function showToast(message: string, kind: ToastKind = "info", duration = 4200): void {
  const host = document.getElementById("toasts");
  if (!host) return;

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.dataset.kind = kind;
  toast.setAttribute("role", kind === "error" ? "alert" : "status");

  const icon = document.createElement("span");
  icon.className = "toast__icon";
  icon.textContent = GLYPH[kind];

  const text = document.createElement("span");
  text.textContent = message;

  toast.append(icon, text);
  host.append(toast);

  window.setTimeout(() => {
    toast.classList.add("toast--leaving");
    window.setTimeout(() => toast.remove(), 340);
  }, duration);
}
