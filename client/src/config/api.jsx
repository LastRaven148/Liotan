const DEVELOPMENT_API_URL = "http://localhost:3001";

const DOMAIN_API_MAP = {
  "liotan.com": "https://api.liotan.com",
  "www.liotan.com": "https://api.liotan.com",
  "tunnel.liotan.com": "https://api-tunnel.liotan.com",

  "liotan.ru": "https://api.liotan.ru",
  "www.liotan.ru": "https://api.liotan.ru"
};

const DOMAIN_CLIENT_MAP = {
  "liotan.com": "https://liotan.com",
  "www.liotan.com": "https://liotan.com",
  "tunnel.liotan.com": "https://tunnel.liotan.com",

  "liotan.ru": "https://liotan.ru",
  "www.liotan.ru": "https://liotan.ru"
};

const API_FALLBACKS_BY_ZONE = {
  com: ["https://api-tunnel.liotan.com"],
  ru: ["https://api-tunnel.liotan.com"],
  tunnel: ["https://api.liotan.com"]
};

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

function getRuntimeHostname() {
  if (typeof window === "undefined") {
    return "";
  }

  return String(window.location?.hostname || "").toLowerCase();
}

function getRuntimeZone() {
  const hostname = getRuntimeHostname();

  if (hostname === "tunnel.liotan.com") return "tunnel";
  if (hostname.endsWith(".ru")) return "ru";
  return "com";
}

function getRuntimePrimaryApiUrl() {
  const hostname = getRuntimeHostname();
  return DOMAIN_API_MAP[hostname] || "";
}

function getRuntimeClientUrl() {
  const hostname = getRuntimeHostname();
  return DOMAIN_CLIENT_MAP[hostname] || "";
}

function resolvePrimaryApiUrl() {
  const envApiUrl = normalizeApiUrl(import.meta.env.VITE_API_URL);

  if (!import.meta.env.PROD) {
    return envApiUrl || DEVELOPMENT_API_URL;
  }

  return (
    getRuntimePrimaryApiUrl() ||
    envApiUrl ||
    "https://api.liotan.com"
  );
}

function resolveBuiltInFallbacks() {
  if (!import.meta.env.PROD) {
    return [];
  }

  return API_FALLBACKS_BY_ZONE[getRuntimeZone()] || API_FALLBACKS_BY_ZONE.com;
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
    ...resolveBuiltInFallbacks()
  ]);
}

export const API = resolvePrimaryApiUrl();
export const API_CANDIDATES = resolveApiCandidates();
export const PRODUCTION_CLIENT_URL =
  getRuntimeClientUrl() ||
  normalizeApiUrl(import.meta.env.VITE_PUBLIC_CLIENT_URL) ||
  "https://liotan.com";
export const PRODUCTION_API_URL_VALUE = API;

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
