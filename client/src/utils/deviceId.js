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

export function getDeviceName() {
  const ua =
    navigator.userAgent || "";

  if (/iPhone|iPad|iPod/i.test(ua)) {
    return "iOS device";
  }

  if (/Android/i.test(ua)) {
    return "Android device";
  }

  if (/Windows/i.test(ua)) {
    return "Windows device";
  }

  if (/Macintosh/i.test(ua)) {
    return "Mac device";
  }

  if (/Linux/i.test(ua)) {
    return "Linux device";
  }

  return "Web device";
}
