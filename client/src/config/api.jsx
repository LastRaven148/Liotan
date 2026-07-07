const PRODUCTION_API_URL = "https://api.liotan.ru";
const DEVELOPMENT_API_URL = "http://localhost:3001";
const BUILTIN_FALLBACK_API_URLS = [
  "https://api.liotan.com"
];

function normalizeApiUrl(url) {
  return String(url || "")
    .trim()
    .replace(/\/+$/, "");
}

function splitUrls(value) {
  return String(value || "")
    .split(",")
    .map(normalizeApiUrl)
    .filter(Boolean);
}

function uniqueUrls(urls) {
  return Array.from(new Set(urls.map(normalizeApiUrl).filter(Boolean)));
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

function resolveApiCandidates() {
  const primary = resolvePrimaryApiUrl();
  const envFallbacks = splitUrls(import.meta.env.VITE_API_FALLBACK_URLS);

  if (!import.meta.env.PROD) {
    return uniqueUrls([primary, ...envFallbacks]);
  }

  return uniqueUrls([
    primary,
    ...envFallbacks,
    ...BUILTIN_FALLBACK_API_URLS
  ]);
}

export const API = resolvePrimaryApiUrl();
export const API_CANDIDATES = resolveApiCandidates();
export const PRODUCTION_CLIENT_URL = "https://liotan.ru";
export const PRODUCTION_API_URL_VALUE = PRODUCTION_API_URL;

let activeApiUrl = API;

export function getApiCandidates() {
  return API_CANDIDATES;
}

export function getActiveApiUrl() {
  return activeApiUrl;
}

export function setActiveApiUrl(url) {
  const normalized = normalizeApiUrl(url);

  if (!normalized || !API_CANDIDATES.includes(normalized)) {
    return false;
  }

  activeApiUrl = normalized;
  return true;
}

export function buildApiUrlForEndpoint(originalUrl, endpoint = activeApiUrl) {
  const value = String(originalUrl || "");
  const cleanEndpoint = normalizeApiUrl(endpoint) || activeApiUrl;

  if (!/^https?:\/\//i.test(value)) {
    return `${cleanEndpoint}${value.startsWith("/") ? value : `/${value}`}`;
  }

  for (const candidate of API_CANDIDATES) {
    if (value === candidate || value.startsWith(`${candidate}/`)) {
      return `${cleanEndpoint}${value.slice(candidate.length)}`;
    }
  }

  return value;
}
