import { store, WIDTH_LIMITS } from "../core/store";
import { clamp } from "../core/util";

const MOBILE_BREAKPOINT = "(max-width: 900px)";
const RESIZE_STEP = 24;

/**
 * Desktop: resizable/collapsible side-by-side layout.
 * Mobile: the editor becomes a floating drawer.
 */
export function initLayout(): void {
  const app = document.getElementById("app") as HTMLElement;
  const splitter = document.getElementById("splitter") as HTMLElement;
  const panelToggle = document.getElementById("panel-toggle") as HTMLElement;
  const drawerToggle = document.getElementById("drawer-toggle") as HTMLElement;
  const scrim = document.getElementById("scrim") as HTMLElement;

  if (!app || !splitter || !panelToggle || !drawerToggle || !scrim) return;

  const mobileQuery = window.matchMedia(MOBILE_BREAKPOINT);
  const isMobile = (): boolean => mobileQuery.matches;

  /* ---------------- prefs -> UI ---------------- */

  const applyPrefs = (): void => {
    const collapsed = store.prefs.collapsed;
    app.dataset.editor = collapsed ? "collapsed" : "expanded";
    document.documentElement.style.setProperty("--editor-w", `${store.prefs.width}px`);
    panelToggle.setAttribute("aria-pressed", String(collapsed));
  };
  store.on("prefs", applyPrefs);
  applyPrefs();

  /* ---------------- collapse / drawer ---------------- */

  const setDrawer = (open: boolean): void => {
    app.dataset.drawer = open ? "open" : "closed";
    drawerToggle.setAttribute("aria-expanded", String(open));
  };

  const toggleEditor = (): void => {
    if (isMobile()) {
      setDrawer(app.dataset.drawer !== "open");
      return;
    }
    store.setPrefs({ collapsed: !store.prefs.collapsed });
  };

  panelToggle.addEventListener("click", toggleEditor);
  drawerToggle.addEventListener("click", () => setDrawer(app.dataset.drawer !== "open"));
  scrim.addEventListener("click", () => setDrawer(false));

  mobileQuery.addEventListener("change", (event) => {
    if (!event.matches) setDrawer(false);
  });

  /* ---------------- splitter drag ---------------- */

  splitter.addEventListener(
    "pointerdown",
    (event) => {
      if (isMobile() || event.button !== 0) return;
      event.preventDefault();
      splitter.dataset.dragging = "true";

      const startX = event.clientX;
      const startWidth = store.prefs.width;

      const move = (moveEvent: PointerEvent): void => {
        const delta = moveEvent.clientX - startX;
        const upper = Math.min(WIDTH_LIMITS.max, window.innerWidth * 0.62);
        store.setPrefs({ width: clamp(startWidth + delta, WIDTH_LIMITS.min, upper) });
      };

      const up = (upEvent: PointerEvent): void => {
        splitter.dataset.dragging = "false";
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        try {
          splitter.releasePointerCapture(upEvent.pointerId);
        } catch {
          /* already released */
        }
      };

      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    { passive: false },
  );

  splitter.addEventListener("keydown", (event) => {
    if (isMobile()) return;
    const upper = Math.min(WIDTH_LIMITS.max, window.innerWidth * 0.62);

    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const delta = event.key === "ArrowRight" ? RESIZE_STEP : -RESIZE_STEP;
      store.setPrefs({ width: clamp(store.prefs.width + delta, WIDTH_LIMITS.min, upper) });
    } else if (event.key === "Home") {
      event.preventDefault();
      store.setPrefs({ width: WIDTH_LIMITS.min });
    } else if (event.key === "End") {
      event.preventDefault();
      store.setPrefs({ width: upper });
    }
  });

  /* ---------------- global shortcuts ---------------- */

  window.addEventListener("keydown", (event) => {
    const mod = event.metaKey || event.ctrlKey;
    if (mod && (event.key === "b" || event.key === "B")) {
      event.preventDefault();
      toggleEditor();
    }
    if (event.key === "Escape" && app.dataset.drawer === "open") {
      setDrawer(false);
    }
  });
}
