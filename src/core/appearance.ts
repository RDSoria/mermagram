export const VISUAL_THEMES = [
  "neumorphic-light",
  "neumorphic-dark",
  "glass-light",
  "glass-dark",
  "retro",
  "dial-up",
] as const;

export type VisualTheme = (typeof VISUAL_THEMES)[number];

export const LAYOUTS = ["classic", "bento"] as const;
export type AppLayout = (typeof LAYOUTS)[number];

export const DEFAULT_VISUAL_THEME: VisualTheme = "neumorphic-light";
export const DEFAULT_LAYOUT: AppLayout = "classic";

export function isVisualTheme(value: unknown): value is VisualTheme {
  return typeof value === "string" && VISUAL_THEMES.includes(value as VisualTheme);
}

export function isAppLayout(value: unknown): value is AppLayout {
  return typeof value === "string" && LAYOUTS.includes(value as AppLayout);
}

export function isDarkTheme(theme: VisualTheme): boolean {
  return theme === "neumorphic-dark" || theme === "glass-dark" || theme === "dial-up";
}
