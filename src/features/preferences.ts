import { getLanguage, LANGUAGES, LANGUAGE_NAMES, onLanguageChange, setLanguage, t, type Language } from "../core/i18n";
import { LAYOUTS, VISUAL_THEMES, type AppLayout, type VisualTheme } from "../core/appearance";
import { store } from "../core/store";

const THEME_LABELS = {
  "neumorphic-light": "themeNeumorphicLight",
  "neumorphic-dark": "themeNeumorphicDark",
  "glass-light": "themeGlassLight",
  "glass-dark": "themeGlassDark",
  retro: "themeRetro",
  "dial-up": "themeDialUp",
} as const;

function fillRadios(
  container: HTMLElement,
  name: string,
  options: Array<[string, string]>,
  selected: string,
  onChange: (value: string) => void,
): void {
  container.replaceChildren(...options.map(([value, labelText]) => {
    const label = document.createElement("label");
    label.className = "preferences-dialog__option";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = name;
    input.value = value;
    input.checked = value === selected;
    input.addEventListener("change", () => {
      if (input.checked) onChange(value);
    });
    const text = document.createElement("span");
    text.textContent = labelText;
    label.append(input, text);
    return label;
  }));
}

export function initPreferences(): void {
  const trigger = document.getElementById("preferences-trigger");
  const dialog = document.getElementById("preferences-dialog") as HTMLDialogElement | null;
  const select = document.getElementById("language-select") as HTMLSelectElement | null;
  const themeOptions = document.getElementById("visual-theme-options");
  const layoutOptions = document.getElementById("layout-options");
  if (!trigger || !dialog || !select || !themeOptions || !layoutOptions) return;

  const populate = (): void => {
    select.replaceChildren(...LANGUAGES.map((code) => {
      const option = document.createElement("option");
      option.value = code;
      option.textContent = LANGUAGE_NAMES[code];
      return option;
    }));
    fillRadios(themeOptions, "visual-theme", VISUAL_THEMES.map((theme): [string, string] => [theme, t(THEME_LABELS[theme])]), store.prefs.visualTheme, (value) => {
      store.setPrefs({ visualTheme: value as VisualTheme });
    });
    fillRadios(layoutOptions, "app-layout", LAYOUTS.map((layout): [string, string] => [
      layout,
      t(layout === "classic" ? "layoutClassic" : "layoutBento"),
    ]), store.prefs.layout, (value) => {
      store.setPrefs({ layout: value as AppLayout });
    });
    select.value = getLanguage();
  };
  populate();
  onLanguageChange(populate);

  trigger.addEventListener("click", () => {
    populate();
    dialog.showModal();
  });

  select.addEventListener("change", () => setLanguage(select.value as Language));
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
}
