const PRODUCTION_API_URL = "https://api.liotan.com";
const DEVELOPMENT_API_URL = "http://localhost:3001";

function normalizeApiUrl(url) {
  return String(url || "")
    .trim()
    .replace(/\/+$/, "");
}

function resolveApiUrl() {
  const envApiUrl = normalizeApiUrl(import.meta.env.VITE_API_URL);

  if (envApiUrl) {
    return envApiUrl;
  }

  if (import.meta.env.PROD) {
    return PRODUCTION_API_URL;
  }

  return DEVELOPMENT_API_URL;
}

export const API = resolveApiUrl();
export const PRODUCTION_CLIENT_URL = "https://liotan.com";
export const PRODUCTION_API_URL_VALUE = PRODUCTION_API_URL;
