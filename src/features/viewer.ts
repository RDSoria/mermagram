import { clamp } from "../core/util";

const MIN_SCALE = 0.15;
const MAX_SCALE = 8;
const FIT_PADDING = 64;
const ZOOM_STEP = 1.22;

export interface DiagramSize {
  width: number;
  height: number;
}

/**
 * Owns the diagram canvas: mounting the rendered SVG and the
 * zoom / pan / fit interactions.
 */
export class Viewer {
  private readonly viewport: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly readout: HTMLElement | null;

  private scale = 1;
  private tx = 0;
  private ty = 0;
  private fitMode = true;
  private current: SVGSVGElement | null = null;
  private width = 0;
  private height = 0;

  private dragging = false;
  private lastX = 0;
  private lastY = 0;

  constructor(viewport: HTMLElement, stage: HTMLElement, readout: HTMLElement | null) {
    this.viewport = viewport;
    this.stage = stage;
    this.readout = readout;

    viewport.addEventListener("pointerdown", this.onPointerDown);
    viewport.addEventListener("pointermove", this.onPointerMove);
    viewport.addEventListener("pointerup", this.onPointerUp);
    viewport.addEventListener("pointercancel", this.onPointerUp);
    viewport.addEventListener("wheel", this.onWheel, { passive: false });
    viewport.addEventListener("dblclick", this.onDoubleClick);

    new ResizeObserver(() => {
      if (this.fitMode) this.fit();
      else this.apply();
    }).observe(viewport);

    this.apply();
  }

  /* ---------------- public API ---------------- */

  setDiagram(svg: SVGSVGElement): void {
    const size = this.measure(svg);
    this.width = size.width;
    this.height = size.height;

    svg.setAttribute("width", String(size.width));
    svg.setAttribute("height", String(size.height));
    svg.style.width = `${size.width}px`;
    svg.style.height = `${size.height}px`;
    svg.style.maxWidth = "none";

    this.stage.replaceChildren(svg);
    this.stage.dataset.empty = "false";
    this.current = svg;
    this.fit();
  }

  hasDiagram(): boolean {
    return this.current !== null;
  }

  getSvg(): SVGSVGElement | null {
    return this.current;
  }

  getSize(): DiagramSize {
    return { width: this.width, height: this.height };
  }

  zoomIn(): void {
    const rect = this.viewport.getBoundingClientRect();
    this.zoomAt(ZOOM_STEP, rect.width / 2, rect.height / 2);
  }

  zoomOut(): void {
    const rect = this.viewport.getBoundingClientRect();
    this.zoomAt(1 / ZOOM_STEP, rect.width / 2, rect.height / 2);
  }

  fit(): void {
    if (!this.current || this.width <= 0 || this.height <= 0) return;
    const rect = this.viewport.getBoundingClientRect();
    const available = {
      w: Math.max(rect.width - FIT_PADDING, 40),
      h: Math.max(rect.height - FIT_PADDING, 40),
    };
    this.scale = clamp(
      Math.min(available.w / this.width, available.h / this.height),
      MIN_SCALE,
      MAX_SCALE,
    );
    this.tx = (rect.width - this.width * this.scale) / 2;
    this.ty = (rect.height - this.height * this.scale) / 2;
    this.fitMode = true;
    this.apply();
  }

  reset(): void {
    const rect = this.viewport.getBoundingClientRect();
    this.scale = 1;
    this.tx = (rect.width - this.width) / 2;
    this.ty = (rect.height - this.height) / 2;
    this.fitMode = false;
    this.apply();
  }

  /* ---------------- internals ---------------- */

  private measure(svg: SVGSVGElement): DiagramSize {
    const viewBox = svg.viewBox?.baseVal;
    let width = viewBox && viewBox.width ? viewBox.width : 0;
    let height = viewBox && viewBox.height ? viewBox.height : 0;

    if (!width || !height) {
      const box = svg.getBoundingClientRect();
      width = box.width || 640;
      height = box.height || 420;
    }

    return { width, height };
  }

  private zoomAt(factor: number, cx: number, cy: number): void {
    if (!this.current) return;
    const next = clamp(this.scale * factor, MIN_SCALE, MAX_SCALE);
    const ratio = next / this.scale;
    this.tx = cx - ratio * (cx - this.tx);
    this.ty = cy - ratio * (cy - this.ty);
    this.scale = next;
    this.fitMode = false;
    this.apply();
  }

  private apply(): void {
    this.stage.style.transform = `translate3d(${this.tx}px, ${this.ty}px, 0) scale(${this.scale})`;
    if (this.readout) {
      this.readout.textContent = `${Math.round(this.scale * 100)}%`;
    }
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || !this.current) return;
    this.dragging = true;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    this.fitMode = false;
    this.viewport.dataset.dragging = "true";
    this.viewport.setPointerCapture(event.pointerId);
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.dragging) return;
    const dx = event.clientX - this.lastX;
    const dy = event.clientY - this.lastY;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    this.tx += dx;
    this.ty += dy;
    this.apply();
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (!this.dragging) return;
    this.dragging = false;
    this.viewport.dataset.dragging = "false";
    try {
      this.viewport.releasePointerCapture(event.pointerId);
    } catch {
      /* pointer already released */
    }
  };

  private onWheel = (event: WheelEvent): void => {
    if (!this.current) return;
    event.preventDefault();
    const rect = this.viewport.getBoundingClientRect();
    const factor = Math.exp(-event.deltaY * 0.0016);
    this.zoomAt(factor, event.clientX - rect.left, event.clientY - rect.top);
  };

  private onDoubleClick = (): void => {
    this.fit();
  };
}
