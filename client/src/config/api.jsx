const PRODUCTION_API_URL = "https://api.liotan.com";
const DEVELOPMENT_API_URL = "http://localhost:3001";

function normalizeApiUrl(url) {
  return String(url || "")
    .trim()
    .replace(/\/+$/, "");
}

function resolvePrimaryApiUrl() {
  const envApiUrl = normalizeApiUrl(import.meta.env.VITE_API_URL);

  if (envApiUrl) {
    return envApiUrl;
  }

  if (import.meta.env.PROD) {
    return PRODUCTION_API_URL;
  }

  return DEVELOPMENT_API_URL;
}

export const API = resolvePrimaryApiUrl();
export const API_CANDIDATES = [API];
export const PRODUCTION_CLIENT_URL = "https://liotan.com";
export const PRODUCTION_API_URL_VALUE = PRODUCTION_API_URL;

export function getApiCandidates() {
  return API_CANDIDATES;
}

export function getActiveApiUrl() {
  return API;
}

export function setActiveApiUrl() {
  return false;
}

export function buildApiUrlForEndpoint(originalUrl) {
  return originalUrl;
}
