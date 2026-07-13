const MESSAGE_SCALE_CLASSES = Array.from({ length: 11 }, (_, index) => `liotan-message-scale-${50 + index * 10}`);

export function normalizeMessageScale(value) {
  return Math.round(Math.min(150, Math.max(50, Number(value) || 100)) / 10) * 10;
}

export function applyMessageScale(value) {
  const normalized = normalizeMessageScale(value);
  document.documentElement.classList.remove(...MESSAGE_SCALE_CLASSES);
  document.documentElement.classList.add(`liotan-message-scale-${normalized}`);
  return normalized;
}

export function applyStoredUiPreferences() {
  applyMessageScale(localStorage.getItem("liotan_text_size") || 100);
  const theme = String(localStorage.getItem("liotan_theme") || "dark");
  document.documentElement.dataset.theme = ["dark", "light", "system"].includes(theme) ? theme : "dark";
}
