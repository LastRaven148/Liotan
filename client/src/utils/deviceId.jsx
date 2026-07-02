const DEVICE_ID_KEY =
  "liotan_device_id";

function safeGetLocalStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return "";
  }
}

function safeSetLocalStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

function createRandomDeviceId() {
  const bytes =
    new Uint8Array(16);

  crypto.getRandomValues(bytes);

  return Array.from(bytes)
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function getDeviceId() {
  let value =
    safeGetLocalStorage(
      DEVICE_ID_KEY
    );

  if (value) {
    return value;
  }

  value =
    createRandomDeviceId();

  safeSetLocalStorage(
    DEVICE_ID_KEY,
    value
  );

  return value;
}

function getBrowserName(ua) {
  if (/Edg\//i.test(ua)) return "Microsoft Edge";
  if (/CriOS\//i.test(ua)) return "Chrome";
  if (/FxiOS\//i.test(ua)) return "Firefox";
  if (/OPR\//i.test(ua)) return "Opera";
  if (/Firefox\//i.test(ua)) return "Firefox";
  if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) return "Chrome";
  if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) return "Safari";
  return "Browser";
}

function getOsName(ua) {
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";

  const android = ua.match(/Android ([0-9.]+)/i);
  if (android) return `Android ${android[1]}`;

  if (/Windows NT/i.test(ua)) return "Windows";
  if (/Macintosh|Mac OS X/i.test(ua)) return "macOS";
  if (/Linux/i.test(ua)) return "Linux";

  return "Web";
}

export function getDeviceName() {
  const ua = navigator.userAgent || "";
  const os = getOsName(ua);
  const browser = getBrowserName(ua);

  if (os === "Web") {
    return `${browser} Web`;
  }

  return `${os} · ${browser}`;
}
