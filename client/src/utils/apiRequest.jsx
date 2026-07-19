import {
  API,
  buildApiUrlForEndpoint,
  getApiCandidates,
  setActiveApiUrl
} from "../config/api";

const CSRF_HEADER = "X-Liotan-CSRF";
const CSRF_VALUE = "liotan-browser-request-v1";

const pendingGetRequests = new Map();
const recentFailedGetRequests = new Map();
const cachedGetResponses = new Map();

const GET_FAIL_COOLDOWN_MS = 15000;
const GET_CACHE_TTL_MS = 15000;
const MAX_PARALLEL_GETS = 4;
const REQUEST_TIMEOUT_MS = 12000;
const UPLOAD_REQUEST_TIMEOUT_MS = 5 * 60 * 1000;

let activeGetCount = 0;
const getQueue = [];

async function waitForGetSlot() {
  while (activeGetCount >= MAX_PARALLEL_GETS) {
    await new Promise((resolve) => getQueue.push(resolve));
  }
  activeGetCount += 1;
}

function releaseGetSlot() {
  activeGetCount = Math.max(0, activeGetCount - 1);
  const next = getQueue.shift();
  if (next) next();
}

function isGetRequest(options) {
  return !options.method || String(options.method).toUpperCase() === "GET";
}

function makeRequestKey(url, options) {
  return `${String(options.method || "GET").toUpperCase()}:${url}`;
}

function cloneData(data) {
  if (data === null || data === undefined) return data;

  try {
    return structuredClone(data);
  } catch {
    return JSON.parse(JSON.stringify(data));
  }
}

function getCachedResponse(key) {
  const cached = cachedGetResponses.get(key);
  if (!cached) return null;

  if (Date.now() > cached.expiresAt) {
    cachedGetResponses.delete(key);
    return null;
  }

  return cloneData(cached.data);
}

function setCachedResponse(key, data) {
  cachedGetResponses.set(key, {
    data: cloneData(data),
    expiresAt: Date.now() + GET_CACHE_TTL_MS
  });
}

export function setApiAuthToken() {
  // Auth uses httpOnly cookies only. This function is kept as a no-op for older imports.
}

export function getApiAuthToken() {
  return "";
}

function isStateChangingMethod(method = "GET") {
  return !["GET", "HEAD", "OPTIONS"].includes(String(method || "GET").toUpperCase());
}

function createTimeoutSignal(options = {}, isFormData = false) {
  if (options.signal) {
    return {
      signal: options.signal,
      cancel: () => {}
    };
  }

  const timeoutMs = Number.isFinite(Number(options.timeoutMs))
    ? Number(options.timeoutMs)
    : isFormData
      ? UPLOAD_REQUEST_TIMEOUT_MS
      : REQUEST_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error("request timeout"));
  }, timeoutMs);

  return {
    signal: controller.signal,
    cancel: () => clearTimeout(timer)
  };
}

function isRetryableNetworkError(err) {
  if (!err || err.status) {
    return false;
  }

  return (
    err.name === "TypeError" ||
    err.name === "AbortError" ||
    /failed to fetch|network|timeout|сервер долго не отвечает/i.test(err.message || "")
  );
}

async function readResponse(response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  return text || null;
}

async function performRequestToEndpoint(url, options = {}, endpoint = API) {
  const method = String(options.method || "GET").toUpperCase();
  const isFormData = options.body instanceof FormData;
  const { signal, cancel } = createTimeoutSignal(options, isFormData);

  const headers = new Headers(options.headers || {});

  if (!isFormData && options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (isStateChangingMethod(method) && !headers.has(CSRF_HEADER)) {
    headers.set(CSRF_HEADER, CSRF_VALUE);
  }

  try {
    const response = await fetch(buildApiUrlForEndpoint(url, endpoint), {
      ...options,
      method,
      headers,
      credentials: "include",
      signal
    });

    const data = await readResponse(response);

    if (!response.ok) {
      const message =
        data?.message ||
        data?.error ||
        `Request failed with status ${response.status}`;

      const error = new Error(message);
      error.status = response.status;
      error.data = data;
      error.suppressUnauthorized = response.status === 401 && Boolean(options.suppressUnauthorized);
      throw error;
    }

    setActiveApiUrl(endpoint);
    return data;
  } catch (err) {
    if (err?.name === "AbortError" || signal?.aborted) {
      throw new Error(isFormData
        ? "Загрузка файла заняла слишком много времени. Проверьте соединение и попробуйте ещё раз."
        : "Сервер долго не отвечает. Попробуйте ещё раз.");
    }
    throw err;
  } finally {
    cancel();
  }
}

async function performRequest(url, options = {}) {
  const candidates = getApiCandidates();
  let lastError = null;

  for (const endpoint of candidates) {
    try {
      return await performRequestToEndpoint(url, options, endpoint);
    } catch (err) {
      lastError = err;

      if (!isRetryableNetworkError(err)) {
        throw err;
      }

      console.warn(`[Liotan API] ${endpoint} failed:`, err.message);
    }
  }

  throw lastError;
}

export function clearApiRequestMemory() {
  pendingGetRequests.clear();
  recentFailedGetRequests.clear();
  cachedGetResponses.clear();
  activeGetCount = 0;
  getQueue.splice(0).forEach((resolve) => resolve());
}

export async function apiRequest(url, options = {}) {
  const isGet = isGetRequest(options);

  if (!isGet) {
    return performRequest(url, options);
  }

  if (options.fresh) {
    const { fresh: _fresh, ...requestOptions } = options;
    return performRequest(url, requestOptions);
  }

  const key = makeRequestKey(url, options);

  const cached = getCachedResponse(key);
  if (cached !== null) {
    return cached;
  }

  const pending = pendingGetRequests.get(key);
  if (pending) {
    return pending;
  }

  const failedAt = recentFailedGetRequests.get(key) || 0;
  const now = Date.now();

  if (failedAt && now - failedAt < GET_FAIL_COOLDOWN_MS) {
    throw new Error("Запрос временно остановлен после ошибки");
  }

  const requestPromise = (async () => {
    await waitForGetSlot();

    try {
      const data = await performRequest(url, options);
      recentFailedGetRequests.delete(key);
      setCachedResponse(key, data);
      return cloneData(data);
    } catch (err) {
      if (!err?.suppressUnauthorized) recentFailedGetRequests.set(key, Date.now());
      throw err;
    } finally {
      releaseGetSlot();
      pendingGetRequests.delete(key);
    }
  })();

  pendingGetRequests.set(key, requestPromise);
  return requestPromise;
}
