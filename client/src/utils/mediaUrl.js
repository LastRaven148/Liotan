import { API }
from "../config/api";

export function mediaUrl(url) {

  if (!url) {
    return "";
  }

  if (
    url.startsWith("http://") ||
    url.startsWith("https://")
  ) {
    return url;
  }

  return `${API}${url}`;

}