import { API }
from "../config/api";

function isAllowedRemoteMediaUrl(value) {
  try {
    const parsed = new URL(value);

    if (parsed.protocol !== "https:") {
      return false;
    }

    return (
      parsed.hostname.endsWith(".cloudinary.com") ||
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
