const path = require("path");

const ALLOWED_ATTACHMENT_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
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
  "text/plain",
  "application/octet-stream",
  "application/zip",
  "application/x-zip-compressed",
  "application/x-7z-compressed",
  "application/vnd.rar",
  "application/x-rar-compressed"
];

const BLOCKED_EXTENSIONS = [
  ".exe", ".msi", ".bat", ".cmd", ".scr", ".com", ".ps1", ".vbs",
  ".js", ".mjs", ".cjs", ".jar", ".apk", ".dmg", ".sh", ".html",
  ".htm", ".svg", ".xml", ".xhtml", ".mhtml", ".php", ".wasm",
  ".lnk", ".reg", ".hta", ".docm", ".xlsm", ".pptm"
];

const ARCHIVE_EXTENSIONS = [".zip", ".7z", ".rar"];
const ENCRYPTED_ATTACHMENT_EXTENSIONS = [".liotanenc", ".liotanvoice", ".liotanmedia", ".liotan"];

const MAX_ATTACHMENT_SIZE = Number(process.env.MAX_ATTACHMENT_SIZE_BYTES) || 50 * 1024 * 1024;

function normalizeMime(value = "") {
  return String(value).split(";")[0].trim().toLowerCase();
}

function getExtension(name = "") {
  return path.extname(String(name)).toLowerCase();
}

function hasBlockedExtension(name = "") {
  const lower = String(name).toLowerCase();
  return BLOCKED_EXTENSIONS.some(ext => lower.endsWith(ext));
}

function hasEncryptedAttachmentExtension(name = "") {
  const lower = String(name).toLowerCase();
  return ENCRYPTED_ATTACHMENT_EXTENSIONS.some(ext => lower.endsWith(ext));
}

function hasArchiveExtension(name = "") {
  return ARCHIVE_EXTENSIONS.includes(getExtension(name));
}

function isArchiveMime(mime) {
  return [
    "application/zip",
    "application/x-zip-compressed",
    "application/x-7z-compressed",
    "application/vnd.rar",
    "application/x-rar-compressed"
  ].includes(mime);
}

function isAllowedAttachment({ mimeType = "", fileName = "", size = 0 }) {
  const normalizedMime = normalizeMime(mimeType);
  const fileSize = Number(size);

  if (!Number.isFinite(fileSize) || fileSize < 0 || fileSize > MAX_ATTACHMENT_SIZE) return false;
  if (hasBlockedExtension(fileName)) return false;
  if (!normalizedMime) return false;

  if (hasEncryptedAttachmentExtension(fileName)) {
    return normalizedMime === "application/octet-stream" || normalizedMime.startsWith("audio/");
  }

  if (normalizedMime === "application/octet-stream") {
    return hasArchiveExtension(fileName);
  }

  if (isArchiveMime(normalizedMime)) {
    return hasArchiveExtension(fileName);
  }

  if (normalizedMime.startsWith("image/") || normalizedMime.startsWith("video/") || normalizedMime.startsWith("audio/")) {
    return true;
  }

  return ALLOWED_ATTACHMENT_MIME.includes(normalizedMime);
}

function bufferStartsWith(buffer, bytes) {
  if (!Buffer.isBuffer(buffer) || buffer.length < bytes.length) return false;
  return bytes.every((byte, index) => buffer[index] === byte);
}

function hasKnownMagicBytes(buffer, mimeType = "") {
  const normalizedMime = normalizeMime(mimeType);
  if (!Buffer.isBuffer(buffer) || !buffer.length) return false;

  if (normalizedMime === "image/jpeg") return bufferStartsWith(buffer, [0xff, 0xd8, 0xff]);
  if (normalizedMime === "image/png") return bufferStartsWith(buffer, [0x89, 0x50, 0x4e, 0x47]);
  if (normalizedMime === "image/webp") {
    return bufferStartsWith(buffer, [0x52, 0x49, 0x46, 0x46]) && buffer.slice(8, 12).toString("ascii") === "WEBP";
  }
  if (normalizedMime === "application/pdf") return bufferStartsWith(buffer, [0x25, 0x50, 0x44, 0x46]);
  if (normalizedMime === "application/zip" || normalizedMime === "application/x-zip-compressed") {
    return bufferStartsWith(buffer, [0x50, 0x4b, 0x03, 0x04]) || bufferStartsWith(buffer, [0x50, 0x4b, 0x05, 0x06]) || bufferStartsWith(buffer, [0x50, 0x4b, 0x07, 0x08]);
  }
  if (normalizedMime === "application/x-7z-compressed") return bufferStartsWith(buffer, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]);
  if (normalizedMime === "application/vnd.rar" || normalizedMime === "application/x-rar-compressed") return bufferStartsWith(buffer, [0x52, 0x61, 0x72, 0x21]);

  if (normalizedMime.startsWith("audio/") || normalizedMime.startsWith("video/") || normalizedMime === "text/plain" || normalizedMime === "application/octet-stream") {
    return true;
  }

  return false;
}

function assertSafeFileBuffer({ buffer, mimeType }) {
  if (!hasKnownMagicBytes(buffer, mimeType)) {
    const err = new Error("file content does not match declared type");
    err.status = 400;
    throw err;
  }
}

function assertAllowedAttachment({ mimeType, fileName, size }) {
  if (!isAllowedAttachment({ mimeType, fileName, size })) {
    const err = new Error("attachment is not allowed");
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
  assertAllowedAttachment,
  assertSafeFileBuffer,
  hasKnownMagicBytes,
  hasEncryptedAttachmentExtension
};
