import { API } from "../config/api";

export function avatarUrl(path) {

  if (!path) {
    return null;
  }

  return `${API}${path}`;

}