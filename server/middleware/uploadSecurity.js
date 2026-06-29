const ALLOWED_ATTACHMENT_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/aac",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
  "text/plain"
];

const BLOCKED_EXTENSIONS = [
  ".exe",
  ".msi",
  ".bat",
  ".cmd",
  ".scr",
  ".com",
  ".ps1",
  ".vbs",
  ".js",
  ".jar",
  ".apk",
  ".dmg",
  ".sh"
];

const MAX_ATTACHMENT_SIZE =
  Number(process.env.MAX_ATTACHMENT_SIZE_BYTES) ||
  100 * 1024 * 1024;

function normalizeMime(value = "") {
  return String(value)
    .split(";")[0]
    .trim()
    .toLowerCase();
}

function hasBlockedExtension(name = "") {
  const lower =
    String(name).toLowerCase();

  return BLOCKED_EXTENSIONS.some(
    ext => lower.endsWith(ext)
  );
}

function isAllowedAttachment({
  mimeType = "",
  fileName = "",
  size = 0
}) {
  const normalizedMime =
    normalizeMime(mimeType);

  if (
    !Number.isFinite(Number(size)) ||
    Number(size) < 0 ||
    Number(size) > MAX_ATTACHMENT_SIZE
  ) {
    return false;
  }

  if (hasBlockedExtension(fileName)) {
    return false;
  }

  if (!normalizedMime) {
    return false;
  }

  if (
    normalizedMime.startsWith("image/") ||
    normalizedMime.startsWith("video/") ||
    normalizedMime.startsWith("audio/")
  ) {
    return true;
  }

  return ALLOWED_ATTACHMENT_MIME.includes(
    normalizedMime
  );
}

function assertAllowedAttachment({
  mimeType,
  fileName,
  size
}) {
  if (
    !isAllowedAttachment({
      mimeType,
      fileName,
      size
    })
  ) {
    const err =
      new Error("attachment is not allowed");

    err.status = 400;
    throw err;
  }
}

module.exports = {
  ALLOWED_ATTACHMENT_MIME,
  BLOCKED_EXTENSIONS,
  MAX_ATTACHMENT_SIZE,
  normalizeMime,
  hasBlockedExtension,
  isAllowedAttachment,
  assertAllowedAttachment
};
