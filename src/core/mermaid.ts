import mermaid from "mermaid";
import { DEFAULT_VISUAL_THEME, type VisualTheme } from "./appearance";

export interface MermaidIssue {
  message: string;
  /** 1-based line number, when the parser reports one. */
  line?: number;
}

const FONT_STACK = '"Outfit", "Avenir Next", system-ui, sans-serif';

interface DiagramPalette {
  ink: string; softInk: string; surface: string; surface2: string; surface3: string;
  accent: string; success: string; line: string; border: string; note: string; inverseText: string;
}

const DIAGRAM_PALETTES: Record<VisualTheme, DiagramPalette> = {
  "neumorphic-light": { ink: "#1e2433", softInk: "#4a5468", surface: "#eef1f7", surface2: "#dfe4ee", surface3: "#e8ecf4", accent: "#bf6141", success: "#2c7a71", line: "#8a94a8", border: "#b9c2d1", note: "#f6e3d5", inverseText: "#fffaf5" },
  "neumorphic-dark": { ink: "#edf1f7", softInk: "#c0c9d8", surface: "#252d3b", surface2: "#303b4b", surface3: "#202631", accent: "#ee9879", success: "#72c5ad", line: "#8897ad", border: "#66758b", note: "#45342f", inverseText: "#18202a" },
  "glass-light": { ink: "#182338", softInk: "#34445f", surface: "#f5f8fc", surface2: "#e2eaf4", surface3: "#edf2f8", accent: "#9a4d37", success: "#235f55", line: "#71829a", border: "#a7b8ce", note: "#f3dfd3", inverseText: "#fffaf5" },
  "glass-dark": { ink: "#f2f5fc", softInk: "#d0daeb", surface: "#263249", surface2: "#34435c", surface3: "#1b2435", accent: "#ffad8c", success: "#8ad8c0", line: "#a1b2cb", border: "#667b9d", note: "#47383c", inverseText: "#17202c" },
  retro: { ink: "#29251f", softInk: "#494033", surface: "#fff6df", surface2: "#e5d6b7", surface3: "#f5ebd3", accent: "#b53227", success: "#426338", line: "#675943", border: "#4b4031", note: "#f3df9b", inverseText: "#fff6df" },
  "dial-up": { ink: "#e0ffe9", softInk: "#c5e8d0", surface: "#17202d", surface2: "#253345", surface3: "#0c121c", accent: "#8fffb0", success: "#83f5a5", line: "#8ca895", border: "#557363", note: "#29332d", inverseText: "#101520" },
};

function themeVariables(theme: VisualTheme): Record<string, string> {
  const p = DIAGRAM_PALETTES[theme];
  return {
    fontFamily: theme === "dial-up" ? '"JetBrains Mono", ui-monospace, monospace' : FONT_STACK,
    fontSize: "15px", background: "transparent", darkMode: String(theme === "neumorphic-dark" || theme === "glass-dark" || theme === "dial-up"),
    primaryColor: p.surface, primaryTextColor: p.ink, primaryBorderColor: p.accent, secondaryColor: p.surface2, tertiaryColor: p.surface3,
    mainBkg: p.surface, nodeBorder: p.accent, nodeTextColor: p.ink, textColor: p.ink, titleColor: p.ink, lineColor: p.line, defaultLinkColor: p.line,
    edgeLabelBackground: p.surface3, clusterBkg: p.surface3, clusterBorder: p.border, labelBackground: p.surface3,
    actorBkg: p.surface, actorBorder: p.accent, actorTextColor: p.ink, actorLineColor: p.line, signalColor: p.softInk, signalTextColor: p.ink,
    sequenceNumberColor: p.inverseText, labelBoxBkgColor: p.surface2, labelBoxBorderColor: p.accent, labelTextColor: p.ink, loopTextColor: p.ink,
    noteBkgColor: p.note, noteBorderColor: p.accent, noteTextColor: p.ink, activationBkgColor: p.surface2, activationBorderColor: p.success,
    fillType0: p.surface, fillType1: p.surface2, fillType2: p.surface3, compositeBackground: p.surface3, altBackground: p.surface2,
    sectionBkgColor: p.surface2, sectionBkgColor2: p.surface3, taskBkgColor: p.accent, taskTextColor: p.inverseText,
    taskTextOutsideColor: p.ink, taskTextLightColor: p.inverseText, gridColor: p.border, todayLineColor: p.success,
    pie1: p.accent, pie2: p.success, pie3: theme === "dial-up" ? "#f0d46e" : "#d9a05b", pie4: "#7c8fb0",
    pieTitleTextColor: p.ink, pieSectionTextColor: p.inverseText, pieStrokeColor: p.surface, pieOuterStrokeColor: p.surface2,
  };
}

let renderCounter = 0;
let initialized = false;
let activeTheme: VisualTheme = DEFAULT_VISUAL_THEME;
let diagramFontsReady: Promise<void> | null = null;
let loadedFontStack = "";

function configureMermaid(theme: VisualTheme): void {
  activeTheme = theme;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    themeVariables: themeVariables(theme),
    fontFamily: FONT_STACK,
    flowchart: { htmlLabels: false, curve: "basis", padding: 14, useMaxWidth: false },
    sequence: {
      useMaxWidth: false,
      mirrorActors: false,
      wrap: true,
      width: 230,
      actorFontFamily: theme === "dial-up" ? '"JetBrains Mono", ui-monospace, monospace' : FONT_STACK,
      actorFontSize: 14,
      messageFontFamily: theme === "dial-up" ? '"JetBrains Mono", ui-monospace, monospace' : FONT_STACK,
      messageFontSize: 15,
    },
    gantt: { useMaxWidth: false },
    class: { useMaxWidth: false },
    state: { useMaxWidth: false },
    er: { useMaxWidth: false },
  });
}

/** Load the bundled UI font before Mermaid measures participant/message labels. */
function ensureDiagramFonts(): Promise<void> {
  if (!("fonts" in document)) return Promise.resolve();
  const fontStack = activeTheme === "dial-up" ? '"JetBrains Mono", ui-monospace, monospace' : FONT_STACK;
  if (!diagramFontsReady || loadedFontStack !== fontStack) {
    loadedFontStack = fontStack;
    diagramFontsReady = (async () => {
      await Promise.all([
        document.fonts.load(`14px ${fontStack}`),
        document.fonts.load(`15px ${fontStack}`),
      ]);
      await document.fonts.ready;
    })().catch(() => undefined);
  }
  return diagramFontsReady;
}

/** Mermaid 12.1 can leave sequence lifelines short when mirrorActors is off. */
function extendSequenceLifelines(svg: SVGSVGElement): void {
  const { y, width, height } = svg.viewBox.baseVal;
  if (!(width > 0 && height > 0)) return;

  const bottom = y + height;
  svg.querySelectorAll<SVGLineElement>("line.actor-line").forEach((line) => {
    const currentEnd = Number(line.getAttribute("y2"));
    if (Number.isFinite(currentEnd) && currentEnd < bottom) {
      line.setAttribute("y2", String(bottom));
    }
  });
}

export function initMermaid(theme: VisualTheme = DEFAULT_VISUAL_THEME): void {
  if (initialized) {
    if (activeTheme !== theme) configureMermaid(theme);
    return;
  }
  initialized = true;
  configureMermaid(theme);
}

export function setMermaidTheme(theme: VisualTheme): void {
  if (theme === activeTheme) return;
  configureMermaid(theme);
}

function normalizeError(error: unknown): MermaidIssue {
  const err = error as {
    str?: string;
    message?: string;
    error?: { message?: string };
    hash?: { text?: string; loc?: { first_line?: number } };
  };

  // Mermaid's DetailedError.str contains the parser's useful explanation (for
  // example, the unexpected token and the expected syntax). hash.text is only
  // lexer context, so it must not replace the actual message.
  const raw = err?.str ?? err?.message ?? err?.error?.message ?? err?.hash?.text ?? String(error);
  const fromMessage = /line\s+(\d+)/i.exec(raw)?.[1];
  const line = err?.hash?.loc?.first_line ?? (fromMessage ? Number(fromMessage) : undefined);

  const clean = raw
    .replace(/^Error:\s*/i, "")
    .replace(/[\t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { message: clean || "Error de sintaxis en el diagrama.", line };
}

/** Validates the source with Mermaid's own parser (no rendering). */
export async function validateMermaid(code: string): Promise<MermaidIssue[]> {
  if (!code.trim()) {
    return [{ message: "El diagrama está vacío. Escribí código Mermaid para empezar.", line: 1 }];
  }

  try {
    // Do not suppress parser errors: false has no diagnostic details, while
    // the thrown Mermaid DetailedError includes the explanation and location.
    await mermaid.parse(code, { suppressErrors: false });
    return [];
  } catch (error) {
    return [normalizeError(error)];
  }
}

/** Renders valid source to a detached `<svg>` element. */
export async function renderMermaid(code: string): Promise<SVGSVGElement> {
  const id = `mmd-render-${++renderCounter}`;
  try {
    await ensureDiagramFonts();
    const { svg } = await mermaid.render(id, code);
    const host = document.createElement("div");
    host.innerHTML = svg;
    const element = host.querySelector("svg");
    if (!element) {
      throw new Error("Mermaid no devolvió un diagrama.");
    }
    extendSequenceLifelines(element as SVGSVGElement);
    return element as SVGSVGElement;
  } finally {
    document.getElementById(`d${id}`)?.remove();
    document.getElementById(id)?.remove();
  }
}

/** Validates and renders a candidate using the exact Mermaid runtime used by the editor. */
export async function validateAndRenderCandidate(
  code: string,
): Promise<{ valid: true } | { valid: false; issues: MermaidIssue[] }> {
  const issues = await validateMermaid(code);
  if (issues.length > 0) return { valid: false, issues };

  try {
    await renderMermaid(code);
    return { valid: true };
  } catch (error) {
    return { valid: false, issues: [normalizeError(error)] };
  }
}
