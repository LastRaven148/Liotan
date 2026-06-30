const DEVICE_ID_KEY =
  "liotan_device_id";

export function getDeviceId() {
  let value =
    localStorage.getItem(
      DEVICE_ID_KEY
    );

  if (value) {
    return value;
  }

  const bytes =
    new Uint8Array(16);

  crypto.getRandomValues(bytes);

  value =
    Array.from(bytes)
      .map(byte => byte.toString(16).padStart(2, "0"))
      .join("");

  localStorage.setItem(
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
  const ios = ua.match(/(?:iPhone OS|CPU OS) ([0-9_]+)/i);
  if (/iPhone/i.test(ua)) return `iPhone${ios ? ` iOS ${ios[1].replace(/_/g, ".")}` : ""}`;
  if (/iPad/i.test(ua)) return `iPad${ios ? ` iPadOS ${ios[1].replace(/_/g, ".")}` : ""}`;
  const android = ua.match(/Android ([0-9.]+)/i);
  if (android) return `Android ${android[1]}`;
  const windows = ua.match(/Windows NT ([0-9.]+)/i);
  if (windows) return "Windows";
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
