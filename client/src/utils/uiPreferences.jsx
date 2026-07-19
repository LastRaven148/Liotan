const MESSAGE_SCALE_CLASSES = Array.from({ length: 11 }, (_, index) => `liotan-message-scale-${50 + index * 10}`);
const THEMES = new Set(["dark", "light", "system"]);
const WALLPAPERS = new Set(["pattern", "plain"]);

function emitPreferenceChange(key, value) {
  window.dispatchEvent(new CustomEvent("liotan:ui-preference", { detail: { key, value } }));
}

export function normalizeMessageScale(value) {
  return Math.round(Math.min(150, Math.max(50, Number(value) || 100)) / 10) * 10;
}

export function applyMessageScale(value) {
  const normalized = normalizeMessageScale(value);
  document.documentElement.classList.remove(...MESSAGE_SCALE_CLASSES);
  document.documentElement.classList.add(`liotan-message-scale-${normalized}`);
  return normalized;
}

export function applyTheme(value, { persist = false } = {}) {
  const theme = THEMES.has(String(value)) ? String(value) : "dark";
  document.documentElement.dataset.theme = theme;
  if (persist) localStorage.setItem("liotan_theme", theme);
  emitPreferenceChange("theme", theme);
  return theme;
}

export function applyWallpaper(value, { persist = false } = {}) {
  const migrated = value === "builtIn" ? "pattern" : value === "personal" ? "plain" : value;
  const wallpaper = WALLPAPERS.has(String(migrated)) ? String(migrated) : "pattern";
  document.documentElement.dataset.wallpaper = wallpaper;
  if (persist) localStorage.setItem("liotan_wallpaper_mode", wallpaper);
  emitPreferenceChange("wallpaper", wallpaper);
  return wallpaper;
}

export function applyTimeFormat(value, { persist = false } = {}) {
  const timeFormat = String(value) === "12" ? "12" : "24";
  document.documentElement.dataset.timeFormat = timeFormat;
  if (persist) localStorage.setItem("liotan_time_format", timeFormat);
  emitPreferenceChange("timeFormat", timeFormat);
  return timeFormat;
}

export function applyStoredUiPreferences() {
  applyMessageScale(localStorage.getItem("liotan_text_size") || 100);
  applyTheme(localStorage.getItem("liotan_theme") || "dark");
  applyWallpaper(localStorage.getItem("liotan_wallpaper_mode") || "pattern");
  applyTimeFormat(localStorage.getItem("liotan_time_format") || "24");
}
