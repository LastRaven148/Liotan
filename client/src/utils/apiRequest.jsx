const CSRF_HEADER = "X-Liotan-CSRF";
const CSRF_VALUE = "liotan-browser-request-v1";


const pendingGetRequests = new Map();
const recentFailedGetRequests = new Map();
const cachedGetResponses = new Map();

const GET_FAIL_COOLDOWN_MS = 15000;
const GET_CACHE_TTL_MS = 15000;
const MAX_PARALLEL_GETS = 4;

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

async function performRequest(url, options = {}) {
  const headers = {
    ...(options.headers || {})
  };

  if (isStateChangingMethod(options.method) && !headers[CSRF_HEADER]) {
    headers[CSRF_HEADER] = CSRF_VALUE;
  }

  let res;

  try {
    res = await fetch(url, {
      ...options,
      credentials: "include",
      headers
    });
  } catch {
    throw new Error("Нет соединения с сервером или запрос был прерван");
  }

  const contentType = res.headers.get("content-type") || "";
  let data = null;

  try {
    if (contentType.includes("application/json")) {
      data = await res.json();
    } else {
      const text = await res.text();
      data = {
        error: text || "Request failed"
      };
    }
  } catch {
    data = {
      error: "Не удалось прочитать ответ сервера"
    };
  }

  if (!res.ok) {
    if (res.status === 401 && !options.suppressUnauthorized) {
      setApiAuthToken("");
      localStorage.removeItem("username");
      window.dispatchEvent(new Event("liotan:session-expired"));
    }

    if (res.status === 413) {
      throw new Error("Файл слишком большой для сервера");
    }

    if (res.status === 408) {
      throw new Error("Загрузка заняла слишком много времени");
    }

    if (res.status >= 500) {
      throw new Error(data?.error || "Ошибка сервера при загрузке");
    }

    throw new Error(data?.error || "Request failed");
  }

  return data;
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
    return performRequest(url, options);
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
