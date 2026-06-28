export function formatFileSize(size) {
  if (!size) {
    return "";
  }

  if (size < 1024 * 1024) {
    return `${Math.ceil(size / 1024)} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDuration(value) {
  if (!Number.isFinite(value)) {
    return "0:00";
  }

  const total =
    Math.floor(value);

  const minutes =
    Math.floor(total / 60);

  const seconds =
    String(total % 60).padStart(2, "0");

  return `${minutes}:${seconds}`;
}