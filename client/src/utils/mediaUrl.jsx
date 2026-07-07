import { API } from "../config/api";

const DEFAULT_MEDIA_ORIGINS = [
  "https://media.liotan.ru",
  "https://media.liotan.com"
];

function normalizeOrigin(origin) {
  return String(origin || "")
    .trim()
    .replace(/\/+$/, "");
}

function splitOrigins(value) {
  return String(value || "")
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);
}

function getAllowedMediaOrigins() {
  return Array.from(new Set([
    ...DEFAULT_MEDIA_ORIGINS,
    normalizeOrigin(import.meta.env.VITE_MEDIA_URL),
    ...splitOrigins(import.meta.env.VITE_MEDIA_URLS),
    API
  ].filter(Boolean)));
}

function isAllowedRemoteMediaUrl(value) {
  try {
    const parsed = new URL(value);

    if (parsed.protocol !== "https:") {
      return false;
    }

    return getAllowedMediaOrigins().includes(parsed.origin);
  } catch {
    return false;
  }
}

export function mediaUrl(url) {
  if (!url) {
    return "";
  }

  if (url.startsWith("/uploads/")) {
    return `${API}${url}`;
  }

  if (
    url.startsWith("http://") ||
    url.startsWith("https://")
  ) {
    return isAllowedRemoteMediaUrl(url)
      ? url
      : "";
  }

  return "";
}
