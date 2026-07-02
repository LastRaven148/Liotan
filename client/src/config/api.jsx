const PRODUCTION_API_URL = "https://api.liotan.com";
const PRODUCTION_RENDER_API_URL = "https://liotan-api.onrender.com";
const PRODUCTION_DIRECT_API_URL = "https://direct-api.liotan.com";
const DEVELOPMENT_API_URL = "http://localhost:3001";
const ACTIVE_API_STORAGE_KEY = "liotan.activeApiUrl";

function normalizeApiUrl(url) {
  return String(url || "")
    .trim()
    .replace(/\/+$/, "");
}

function splitApiUrls(value) {
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
  const envFallbacks = splitApiUrls(import.meta.env.VITE_API_FALLBACK_URLS);

  if (!import.meta.env.PROD) {
    return uniqueUrls([
      primary,
      ...envFallbacks
    ]);
  }

  return uniqueUrls([
    primary,
    ...envFallbacks,
    PRODUCTION_RENDER_API_URL,
    PRODUCTION_DIRECT_API_URL
  ]);
}

export const API = resolvePrimaryApiUrl();
export const API_CANDIDATES = resolveApiCandidates();
export const PRODUCTION_CLIENT_URL = "https://liotan.com";
export const PRODUCTION_API_URL_VALUE = PRODUCTION_API_URL;

export function getApiCandidates() {
  return API_CANDIDATES;
}

export function getActiveApiUrl() {
  try {
    const stored = normalizeApiUrl(localStorage.getItem(ACTIVE_API_STORAGE_KEY));

    if (stored && API_CANDIDATES.includes(stored)) {
      return stored;
    }
  } catch {
    // Ignore blocked localStorage and use the primary endpoint.
  }

  return API;
}

export function setActiveApiUrl(url) {
  const cleanUrl = normalizeApiUrl(url);

  if (!cleanUrl || !API_CANDIDATES.includes(cleanUrl)) {
    return;
  }

  const previous = getActiveApiUrl();

  try {
    localStorage.setItem(ACTIVE_API_STORAGE_KEY, cleanUrl);
  } catch {
    // Endpoint fallback must keep working even when localStorage is blocked.
  }

  if (previous !== cleanUrl && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("liotan:api-endpoint-changed", {
      detail: {
        apiUrl: cleanUrl
      }
    }));
  }
}

export function buildApiUrlForEndpoint(originalUrl, endpoint) {
  const cleanEndpoint = normalizeApiUrl(endpoint);

  if (!cleanEndpoint) {
    return originalUrl;
  }

  const primaryPrefix = `${API}/`;

  if (String(originalUrl).startsWith(primaryPrefix)) {
    return `${cleanEndpoint}/${String(originalUrl).slice(primaryPrefix.length)}`;
  }

  try {
    const parsed = new URL(originalUrl);
    return `${cleanEndpoint}${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return originalUrl;
  }
}
