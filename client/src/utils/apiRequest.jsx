import { API } from "../config/api";
const CSRF_HEADER = "X-Liotan-CSRF";
const CSRF_VALUE = "liotan-browser-request-v1";


const pendingGetRequests = new Map();
const recentFailedGetRequests = new Map();
const cachedGetResponses = new Map();

const GET_FAIL_COOLDOWN_MS = 15000;
const GET_CACHE_TTL_MS = 15000;
const MAX_PARALLEL_GETS = 4;
const REQUEST_TIMEOUT_MS = 12000;

let activeGetCount = 0;
const getQueue = [];


async function waitForGetSlot() {
  while (activeGetCount >= MAX_PARALLEL_GETS) {
    await new Promise(resolve => getQueue.push(resolve));
  }
  activeGetCount += 1;
}

function releaseGetSlot() {
  activeGetCount = Math.max(0, activeGetCount - 1);
  const next = getQueue.shift();
  if (next) {
    next();
  }
}

function isGetRequest(options) {
  return !options.method || String(options.method).toUpperCase() === "GET";
}

function makeRequestKey(url, options) {
  return `${String(options.method || "GET").toUpperCase()}:${url}`;
}

function cloneData(data) {
  if (data === null || data === undefined) {
    return data;
  }

  try {
    return structuredClone(data);
  } catch {
    return JSON.parse(JSON.stringify(data));
  }
}

function getCachedResponse(key) {
  const cached =
    cachedGetResponses.get(key);

  if (!cached) {
    return null;
  }

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

function createTimeoutSignal(options = {}) {
  if (options.signal) {
    return {
      signal: options.signal,
      cancel: () => {}
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  return {
    signal: controller.signal,
    cancel: () => clearTimeout(timer)
  };
}

async function performRequestWithEndpointFallback(url, options = {}) {
  return performRequest(url, options);
}

export function clearApiRequestMemory() {
  pendingGetRequests.clear();
  recentFailedGetRequests.clear();
  cachedGetResponses.clear();
  activeGetCount = 0;
  getQueue.splice(0).forEach(resolve => resolve());
}

export async function apiRequest(url, options = {}) {
  const isGet = isGetRequest(options);

  if (!isGet) {
    return performRequestWithEndpointFallback(url, options);
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
      const data = await performRequestWithEndpointFallback(url, options);
      recentFailedGetRequests.delete(key);
      setCachedResponse(key, data);
      return cloneData(data);
    } catch (err) {
      recentFailedGetRequests.set(key, Date.now());
      throw err;
    } finally {
      releaseGetSlot();
      pendingGetRequests.delete(key);
    }
  })();

  pendingGetRequests.set(key, requestPromise);
  return requestPromise;
}
