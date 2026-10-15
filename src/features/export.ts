import type { Viewer } from "./viewer";
import { showToast } from "./toast";
import { t } from "../core/i18n";
import { saveBytes } from "../platform/save";
import { timestampedName } from "../core/util";

type ExportFormat = "png" | "svg" | "pdf";

const SVG_NS = "http://www.w3.org/2000/svg";
/** Keep the existing PNG canvas unchanged; SVG/PDF use the active skin canvas. */
const EXPORT_BACKGROUND = "#eef1f7";
const RENDER_SCALE = 2;
const PDF_RENDER_SCALE = 3;
const PDF_MAX_PAGE_PT = 14_000;
const PDF_MAX_RASTER_SIDE = 16_000;
const PDF_MAX_RASTER_PIXELS = 36_000_000;
const PDF_PAGE_PADDING = 28;

interface ExportArtifact {
  width: number;
  height: number;
  /** serialized markup, fonts inlined for standalone rendering */
  markup: string;
  background: string;
}

interface ExportOptions {
  viewer: Viewer;
  menu: HTMLElement;
  trigger: HTMLElement;
  items: HTMLElement[];
}

export interface ExportController {
  setEnabled(enabled: boolean): void;
}

let fontCssCache: string | null = null;

const FONT_URLS: Array<[string, string, string]> = [
  ["Outfit", new URL("../assets/fonts/outfit-latin.woff2", import.meta.url).href, "300 700"],
  ["JetBrains Mono", new URL("../assets/fonts/jetbrains-mono-latin.woff2", import.meta.url).href, "400 600"],
];

async function toBase64(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** @font-face rules with the app fonts embedded as data: URIs. */
async function fontFacesCss(): Promise<string> {
  if (fontCssCache !== null) return fontCssCache;

  const faces: string[] = [];
  for (const [family, url, weight] of FONT_URLS) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const base64 = await toBase64(await response.arrayBuffer());
      faces.push(
        `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};` +
          `src:url(data:font/woff2;base64,${base64}) format('woff2')}`,
      );
    } catch {
      /* font embedding is best-effort; exports still work with fallbacks */
    }
  }
  fontCssCache = faces.join("\n");
  return fontCssCache;
}

async function inlineFonts(svg: SVGSVGElement): Promise<void> {
  const css = await fontFacesCss();
  if (!css) return;
  const style = document.createElementNS(SVG_NS, "style");
  style.textContent = css;
  svg.insertBefore(style, svg.firstChild);
}

/**
 * Mermaid styles diagrams with a mixture of embedded CSS and application
 * styles. External SVG viewers do not always apply those styles consistently,
 * so bake the rendered SVG presentation onto each element before serializing.
 */
function inlineRenderedStyles(source: SVGSVGElement, clone: SVGSVGElement): void {
  const properties = [
    "color", "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width",
    "stroke-opacity", "stroke-dasharray", "stroke-dashoffset", "stroke-linecap",
    "stroke-linejoin", "stroke-miterlimit", "opacity", "display", "visibility",
    "font-family", "font-size", "font-style", "font-weight", "font-stretch",
    "text-anchor", "dominant-baseline", "alignment-baseline", "letter-spacing",
    "word-spacing", "white-space", "shape-rendering", "text-rendering",
    "paint-order", "marker-start", "marker-mid", "marker-end", "clip-path", "mask",
  ];
  const originals = [source, ...source.querySelectorAll<SVGElement>("*")];
  const copies = [clone, ...clone.querySelectorAll<SVGElement>("*")];

  originals.forEach((element, index) => {
    const target = copies[index];
    if (!target) return;
    const computed = getComputedStyle(element);
    for (const property of properties) {
      const value = computed.getPropertyValue(property);
      if (value) target.style.setProperty(property, value);
    }
  });
}

/** Convert Mermaid's HTML node labels into native SVG text for SVG viewers
 * that do not implement XHTML content inside <foreignObject>. */
function materializeHtmlLabels(source: SVGSVGElement, clone: SVGSVGElement): void {
  const sourceLabels = source.querySelectorAll<SVGForeignObjectElement>("foreignObject");
  const clonedLabels = clone.querySelectorAll<SVGForeignObjectElement>("foreignObject");
  const measureCanvas = document.createElement("canvas");
  const measureContext = measureCanvas.getContext("2d");
  if (!measureContext) return;

  sourceLabels.forEach((foreignObject, index) => {
    const target = clonedLabels[index];
    const html = foreignObject.querySelector<HTMLElement>("div");
    if (!target || !html) return;

    const style = getComputedStyle(html);
    const fontSize = Number.parseFloat(style.fontSize) || 15;
    const lineHeight = Number.parseFloat(style.lineHeight) || fontSize * 1.5;
    const width = Number.parseFloat(foreignObject.getAttribute("width") ?? "") || 120;
    const x = Number.parseFloat(foreignObject.getAttribute("x") ?? "") || 0;
    const y = Number.parseFloat(foreignObject.getAttribute("y") ?? "") || 0;
    const fontWeight = style.fontWeight === "normal" ? "400" : style.fontWeight;
    measureContext.font = `${fontWeight} ${style.fontStyle} ${fontSize}px ${style.fontFamily}`;

    const paragraphs = [...html.querySelectorAll("p")].map((paragraph) =>
      (paragraph.textContent ?? "").replace(/\s+/g, " ").trim(),
    ).filter(Boolean);
    const text = paragraphs.length ? paragraphs : [(html.textContent ?? "").replace(/\s+/g, " ").trim()];
    const lines: string[] = [];
    for (const paragraph of text) {
      let line = "";
      for (const word of paragraph.split(" ")) {
        const candidate = line ? `${line} ${word}` : word;
        if (line && measureContext.measureText(candidate).width > width) {
          lines.push(line);
          line = word;
        } else {
          line = candidate;
        }
      }
      if (line) lines.push(line);
    }
    if (lines.length === 0) return;

    const svgText = document.createElementNS(SVG_NS, "text");
    svgText.setAttribute("x", String(x + width / 2));
    svgText.setAttribute("y", String(y + (Number.parseFloat(foreignObject.getAttribute("height") ?? "") - lines.length * lineHeight) / 2 + fontSize));
    svgText.setAttribute("text-anchor", "middle");
    svgText.setAttribute("font-family", style.fontFamily);
    svgText.setAttribute("font-size", style.fontSize);
    svgText.setAttribute("font-weight", fontWeight);
    svgText.setAttribute("fill", style.color);
    lines.forEach((line, lineIndex) => {
      const tspan = document.createElementNS(SVG_NS, "tspan");
      tspan.setAttribute("x", String(x + width / 2));
      if (lineIndex > 0) tspan.setAttribute("dy", String(lineHeight));
      tspan.textContent = line;
      svgText.appendChild(tspan);
    });
    target.replaceWith(svgText);
  });
}

function themeBackground(): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue("--surface-canvas").trim() || EXPORT_BACKGROUND;
}

function parseHexColor(color: string): [number, number, number] {
  const value = color.trim();
  const match = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(value);
  if (!match) return [238, 241, 247];
  const hex = match[1].length === 3
    ? [...match[1]].map((digit) => digit + digit).join("")
    : match[1];
  return [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16)) as [number, number, number];
}

function svgBounds(svg: SVGSVGElement, fallback: { width: number; height: number }): {
  x: number; y: number; width: number; height: number;
} {
  const values = svg.getAttribute("viewBox")?.trim().split(/[\s,]+/).map(Number);
  if (values?.length === 4 && values.every(Number.isFinite) && values[2] > 0 && values[3] > 0) {
    return { x: values[0], y: values[1], width: values[2], height: values[3] };
  }

  const width = Number.parseFloat(svg.getAttribute("width") ?? "") || fallback.width;
  const height = Number.parseFloat(svg.getAttribute("height") ?? "") || fallback.height;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("El diagrama no tiene dimensiones exportables válidas.");
  }
  return { x: 0, y: 0, width, height };
}

async function buildArtifact(viewer: Viewer, includeThemeBackground = false): Promise<ExportArtifact> {
  const source = viewer.getSvg();
  if (!source) {
    throw new Error(t("noValidDiagram"));
  }

  const clone = source.cloneNode(true) as SVGSVGElement;
  inlineRenderedStyles(source, clone);
  // Keep source/clone elements aligned while baking computed styles. Replacing
  // foreignObjects first shifts the positional correspondence for all nodes
  // that follow them in the SVG tree.
  materializeHtmlLabels(source, clone);
  const bounds = svgBounds(source, viewer.getSize());
  const { width, height } = bounds;
  const background = themeBackground();

  clone.setAttribute("xmlns", SVG_NS);
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  clone.setAttribute("viewBox", `${bounds.x} ${bounds.y} ${width} ${height}`);
  clone.setAttribute("preserveAspectRatio", "xMidYMid meet");
  clone.style.width = `${width}px`;
  clone.style.height = `${height}px`;
  clone.style.maxWidth = "none";

  if (includeThemeBackground) {
    const backdrop = document.createElementNS(SVG_NS, "rect");
    backdrop.setAttribute("x", String(bounds.x));
    backdrop.setAttribute("y", String(bounds.y));
    backdrop.setAttribute("width", String(width));
    backdrop.setAttribute("height", String(height));
    backdrop.setAttribute("fill", background);
    backdrop.setAttribute("data-export-background", "true");
    clone.insertBefore(backdrop, clone.firstChild);
  }

  await inlineFonts(clone);

  const markup = new XMLSerializer().serializeToString(clone);
  return { width, height, markup, background };
}

function svgDataUrl(markup: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
}

async function loadRasterImage(markup: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(t("rasterizeError")));
    image.src = svgDataUrl(markup);
  });
}

async function rasterize(artifact: ExportArtifact, scale: number): Promise<Blob> {
  const image = await loadRasterImage(artifact.markup);

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(artifact.width * scale));
  canvas.height = Math.max(1, Math.round(artifact.height * scale));

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(t("canvasUnavailable"));

  ctx.fillStyle = EXPORT_BACKGROUND;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, artifact.width, artifact.height);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error(t("pngError"));
  return blob;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(t("imageReadError")));
    reader.readAsDataURL(blob);
  });
}

async function renderPdfRaster(artifact: ExportArtifact): Promise<Uint8Array> {
  const { jsPDF } = await import("jspdf");
  const sideScale = PDF_MAX_RASTER_SIDE / Math.max(artifact.width, artifact.height);
  const areaScale = Math.sqrt(PDF_MAX_RASTER_PIXELS / (artifact.width * artifact.height));
  const rasterScale = Math.max(0.01, Math.min(PDF_RENDER_SCALE, sideScale, areaScale));
  const image = await loadRasterImage(artifact.markup);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(artifact.width * rasterScale));
  canvas.height = Math.max(1, Math.ceil(artifact.height * rasterScale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error(t("canvasUnavailable"));
  context.fillStyle = artifact.background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.setTransform(rasterScale, 0, 0, rasterScale, 0, 0);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, artifact.width, artifact.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error(t("pngError"));
  const dataUrl = await blobToDataUrl(blob);

  const fitScale = Math.min(1, (PDF_MAX_PAGE_PT - PDF_PAGE_PADDING * 2) / Math.max(artifact.width, artifact.height));
  const contentWidth = artifact.width * fitScale;
  const contentHeight = artifact.height * fitScale;
  const doc = new jsPDF({
    orientation: artifact.width >= artifact.height ? "landscape" : "portrait",
    unit: "pt",
    format: [contentWidth + PDF_PAGE_PADDING * 2, contentHeight + PDF_PAGE_PADDING * 2],
    compress: true,
  });

  doc.setFillColor(...parseHexColor(artifact.background));
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), doc.internal.pageSize.getHeight(), "F");
  doc.addImage(dataUrl, "PNG", PDF_PAGE_PADDING, PDF_PAGE_PADDING, contentWidth, contentHeight);

  return new Uint8Array(doc.output("arraybuffer") as ArrayBuffer);
}

const FILTERS: Record<ExportFormat, { name: string; extensions: string[] }> = {
  png: { name: "Imagen PNG", extensions: ["png"] },
  svg: { name: "Imagen SVG", extensions: ["svg"] },
  pdf: { name: "Documento PDF", extensions: ["pdf"] },
};

const MIME: Record<ExportFormat, string> = {
  png: "image/png",
  svg: "image/svg+xml",
  pdf: "application/pdf",
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function initExport(options: ExportOptions): ExportController {
  const { viewer, menu, trigger, items } = options;

  let busy = false;
  let enabled = true;

  const setMenuOpen = (open: boolean): void => {
    menu.dataset.open = String(open);
    trigger.setAttribute("aria-expanded", String(open));
    if (open) refreshDisabledState();
  };

  const refreshDisabledState = (): void => {
    const usable = enabled && !busy;
    trigger.toggleAttribute("aria-disabled", !usable);
    for (const item of items) {
      item.toggleAttribute("aria-disabled", !usable);
    }
    menu.dataset.disabled = String(!usable);
  };

  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    setMenuOpen(menu.dataset.open !== "true");
  });

  for (const item of items) {
    item.addEventListener("click", () => {
      const format = item.dataset.format as ExportFormat | undefined;
      if (format) void run(format);
    });
  }

  window.addEventListener("pointerdown", (event) => {
    if (menu.dataset.open !== "true") return;
    if (menu.contains(event.target as Node)) return;
    setMenuOpen(false);
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menu.dataset.open === "true") {
      setMenuOpen(false);
      trigger.focus();
    }
  });

  async function run(format: ExportFormat): Promise<void> {
    if (busy || !enabled) return;
    busy = true;
    setMenuOpen(false);
    refreshDisabledState();

    try {
      const result = await (async () => {
        switch (format) {
          case "png": {
            const artifact = await buildArtifact(viewer);
            const blob = await rasterize(artifact, RENDER_SCALE);
            const data = new Uint8Array(await blob.arrayBuffer());
            return saveBytes({
              defaultName: timestampedName("png"),
              data,
              mime: MIME.png,
              filters: [FILTERS.png],
            });
          }
          case "svg": {
            const artifact = await buildArtifact(viewer, true);
            const data = new TextEncoder().encode(artifact.markup);
            return saveBytes({
              defaultName: timestampedName("svg"),
              data,
              mime: MIME.svg,
              filters: [FILTERS.svg],
            });
          }
          case "pdf": {
            const artifact = await buildArtifact(viewer, true);
            // The PDF converter can silently omit or clip valid SVG features.
            // Rasterize the same standalone artifact so completeness is deterministic.
            const bytes = await renderPdfRaster(artifact);
            return saveBytes({
              defaultName: timestampedName("pdf"),
              data: bytes,
              mime: MIME.pdf,
              filters: [FILTERS.pdf],
            });
          }
        }
      })();

      if (result.status === "cancelled") {
        showToast(t("exportCancelled"), "info");
      } else {
        showToast(t("exported", { format: format.toUpperCase(), path: result.path }), "success");
      }
    } catch (error) {
      showToast(errorMessage(error, t("exportError")), "error");
    } finally {
      busy = false;
      refreshDisabledState();
    }
  }

  return {
    setEnabled(value: boolean): void {
      enabled = value;
      refreshDisabledState();
    },
  };
}
