import { API }
from "../config/api";

const DEFAULT_MEDIA_ORIGIN = "https://media.liotan.com";

function isAllowedRemoteMediaUrl(value) {
  try {
    const parsed = new URL(value);

    if (parsed.protocol !== "https:") {
      return false;
    }

    const mediaOrigin = String(import.meta.env.VITE_MEDIA_URL || DEFAULT_MEDIA_ORIGIN)
      .replace(/\/+$/, "");

    return (
      parsed.origin === mediaOrigin ||
      parsed.origin === API
    );
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
