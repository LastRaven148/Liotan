const path = require("path");

const MB = 1024 * 1024;

const MAX_PHOTO_SIZE = Number(process.env.MAX_PHOTO_SIZE_BYTES) || 10 * MB;
const MAX_VIDEO_SIZE = Number(process.env.MAX_VIDEO_SIZE_BYTES) || 100 * MB;
const MAX_AUDIO_SIZE = Number(process.env.MAX_AUDIO_SIZE_BYTES) || 50 * MB;
const MAX_FILE_SIZE = Number(process.env.MAX_FILE_SIZE_BYTES) || 100 * MB;
const MAX_AVATAR_SIZE = Number(process.env.MAX_AVATAR_SIZE_BYTES) || 5 * MB;
const MAX_ATTACHMENT_SIZE = Math.max(MAX_PHOTO_SIZE, MAX_VIDEO_SIZE, MAX_AUDIO_SIZE, MAX_FILE_SIZE);

const IMAGE_MIME_BY_EXT = {
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".png": ["image/png"],
  ".webp": ["image/webp"],
  ".gif": ["image/gif"]
};

const VIDEO_MIME_BY_EXT = {
  ".mp4": ["video/mp4"],
  ".webm": ["video/webm"],
  ".mov": ["video/quicktime", "video/mp4"]
};

const AUDIO_MIME_BY_EXT = {
  ".mp3": ["audio/mpeg", "audio/mp3"],
  ".m4a": ["audio/mp4", "audio/aac", "audio/x-m4a"],
  ".aac": ["audio/aac"],
  ".ogg": ["audio/ogg", "application/ogg"],
  ".wav": ["audio/wav", "audio/wave", "audio/x-wav"],
  ".webm": ["audio/webm"]
};

const DOCUMENT_MIME_BY_EXT = {
  ".pdf": ["application/pdf"],
  ".txt": ["text/plain"],
  ".zip": ["application/zip", "application/x-zip-compressed", "application/octet-stream"],
  ".7z": ["application/x-7z-compressed", "application/octet-stream"],
  ".rar": ["application/vnd.rar", "application/x-rar-compressed", "application/octet-stream"]
};

const ENCRYPTED_ATTACHMENT_EXTENSIONS = [".liotanenc", ".liotanvoice", ".liotanmedia", ".liotan"];

const ALLOWED_ATTACHMENT_MIME = Array.from(new Set([
  ...Object.values(IMAGE_MIME_BY_EXT).flat(),
  ...Object.values(VIDEO_MIME_BY_EXT).flat(),
  ...Object.values(AUDIO_MIME_BY_EXT).flat(),
  ...Object.values(DOCUMENT_MIME_BY_EXT).flat(),
  "application/octet-stream"
]));

const BLOCKED_EXTENSIONS = [
  ".exe", ".msi", ".bat", ".cmd", ".scr", ".com", ".ps1", ".vbs",
  ".js", ".mjs", ".cjs", ".jar", ".apk", ".dmg", ".sh", ".html",
  ".htm", ".svg", ".xml", ".xhtml", ".mhtml", ".php", ".wasm",
  ".lnk", ".reg", ".hta", ".docm", ".xlsm", ".pptm"
];

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

function mimeMatchesExtension(mimeType, fileName, map) {
  const ext = getExtension(fileName);
  const allowed = map[ext];
  return Boolean(allowed && allowed.includes(normalizeMime(mimeType)));
}

function getUploadKind({ mimeType = "", fileName = "" }) {
  const mime = normalizeMime(mimeType);

  if (hasEncryptedAttachmentExtension(fileName)) return "encrypted";
  if (mimeMatchesExtension(mime, fileName, IMAGE_MIME_BY_EXT)) return "photo";
  if (mimeMatchesExtension(mime, fileName, VIDEO_MIME_BY_EXT)) return "video";
  if (mimeMatchesExtension(mime, fileName, AUDIO_MIME_BY_EXT)) return "audio";
  if (mimeMatchesExtension(mime, fileName, DOCUMENT_MIME_BY_EXT)) return "file";

  return "unknown";
}

function getMaxSizeByKind(kind) {
  if (kind === "photo") return MAX_PHOTO_SIZE;
  if (kind === "video") return MAX_VIDEO_SIZE;
  if (kind === "audio") return MAX_AUDIO_SIZE;
  if (kind === "file" || kind === "encrypted") return MAX_FILE_SIZE;
  return 0;
}

function isAllowedAttachment({ mimeType = "", fileName = "", size = 0 }) {
  const normalizedMime = normalizeMime(mimeType);
  const fileSize = Number(size);
  const kind = getUploadKind({ mimeType: normalizedMime, fileName });
  const maxSize = getMaxSizeByKind(kind);

  if (!Number.isFinite(fileSize) || fileSize < 0) return false;
  if (hasBlockedExtension(fileName)) return false;
  if (!normalizedMime || kind === "unknown" || maxSize <= 0) return false;
  if (fileSize > 0 && fileSize > maxSize) return false;

  if (kind === "encrypted") {
    return normalizedMime === "application/octet-stream";
  }

  return true;
}

function isAllowedAvatar({ mimeType = "", fileName = "", size = 0 }) {
  const fileSize = Number(size);
  if (!Number.isFinite(fileSize) || fileSize < 0 || fileSize > MAX_AVATAR_SIZE) return false;
  if (hasBlockedExtension(fileName)) return false;
  return mimeMatchesExtension(mimeType, fileName, IMAGE_MIME_BY_EXT);
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
  if (normalizedMime === "image/gif") return bufferStartsWith(buffer, [0x47, 0x49, 0x46, 0x38]);
  if (normalizedMime === "image/webp") {
    return bufferStartsWith(buffer, [0x52, 0x49, 0x46, 0x46]) && buffer.slice(8, 12).toString("ascii") === "WEBP";
  }
  if (normalizedMime === "application/pdf") return bufferStartsWith(buffer, [0x25, 0x50, 0x44, 0x46]);
  if (normalizedMime === "application/zip" || normalizedMime === "application/x-zip-compressed") {
    return bufferStartsWith(buffer, [0x50, 0x4b, 0x03, 0x04]) || bufferStartsWith(buffer, [0x50, 0x4b, 0x05, 0x06]) || bufferStartsWith(buffer, [0x50, 0x4b, 0x07, 0x08]);
  }
  if (normalizedMime === "application/x-7z-compressed") return bufferStartsWith(buffer, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]);
  if (normalizedMime === "application/vnd.rar" || normalizedMime === "application/x-rar-compressed") return bufferStartsWith(buffer, [0x52, 0x61, 0x72, 0x21]);
  if (normalizedMime === "application/octet-stream") return false;
  if (normalizedMime === "text/plain") {
    return !buffer.includes(0);
  }
  if (normalizedMime === "video/mp4" || normalizedMime === "video/quicktime" || normalizedMime === "audio/mp4" || normalizedMime === "audio/x-m4a") {
    return buffer.length >= 12 && buffer.slice(4, 8).toString("ascii") === "ftyp";
  }
  if (normalizedMime === "video/webm" || normalizedMime === "audio/webm") {
    return bufferStartsWith(buffer, [0x1a, 0x45, 0xdf, 0xa3]);
  }
  if (normalizedMime === "audio/mpeg" || normalizedMime === "audio/mp3") {
    return bufferStartsWith(buffer, [0x49, 0x44, 0x33]) || (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0);
  }
  if (normalizedMime === "audio/ogg" || normalizedMime === "application/ogg") {
    return buffer.slice(0, 4).toString("ascii") === "OggS";
  }
  if (normalizedMime === "audio/wav" || normalizedMime === "audio/wave" || normalizedMime === "audio/x-wav") {
    return bufferStartsWith(buffer, [0x52, 0x49, 0x46, 0x46]) && buffer.slice(8, 12).toString("ascii") === "WAVE";
  }
  if (normalizedMime === "audio/aac") {
    return buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xf0) === 0xf0;
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

function assertAllowedAvatar({ mimeType, fileName, size }) {
  if (!isAllowedAvatar({ mimeType, fileName, size })) {
    const err = new Error("avatar is not allowed");
    err.status = 400;
    throw err;
  }
}

module.exports = {
  ALLOWED_ATTACHMENT_MIME,
  BLOCKED_EXTENSIONS,
  ENCRYPTED_ATTACHMENT_EXTENSIONS,
  MAX_ATTACHMENT_SIZE,
  MAX_PHOTO_SIZE,
  MAX_VIDEO_SIZE,
  MAX_AUDIO_SIZE,
  MAX_FILE_SIZE,
  MAX_AVATAR_SIZE,
  normalizeMime,
  hasBlockedExtension,
  hasEncryptedAttachmentExtension,
  getUploadKind,
  getMaxSizeByKind,
  isAllowedAttachment,
  isAllowedAvatar,
  assertAllowedAttachment,
  assertAllowedAvatar,
  assertSafeFileBuffer,
  hasKnownMagicBytes
};
