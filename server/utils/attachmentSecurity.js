const path = require("path");

const {
  ALLOWED_ATTACHMENT_MIME,
  MAX_ATTACHMENT_SIZE,
  normalizeMime,
  hasBlockedExtension,
  isAllowedAttachment
} = require("../middleware/uploadSecurity");

const ALLOWED_ATTACHMENT_TYPES = [
  "photo",
  "video",
  "audio",
  "voice",
  "file"
];

const SAFE_NAME_FALLBACK = "file";

function sanitizeFileName(value = "") {
  const raw = String(value || SAFE_NAME_FALLBACK)
    .replace(/[\\/\0\r\n\t]/g, " ")
    .replace(/[<>:"|?*]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);

  return raw || SAFE_NAME_FALLBACK;
}

function getExtension(fileName = "") {
  return path
    .extname(String(fileName))
    .toLowerCase();
}

function isDangerousName(fileName = "") {
  const name = sanitizeFileName(fileName).toLowerCase();

  if (hasBlockedExtension(name)) {
    return true;
  }

  if (
    name.endsWith(".html") ||
    name.endsWith(".htm") ||
    name.endsWith(".svg") ||
    name.endsWith(".xml") ||
    name.endsWith(".xhtml") ||
    name.endsWith(".mhtml") ||
    name.endsWith(".hta") ||
    name.endsWith(".php") ||
    name.endsWith(".asp") ||
    name.endsWith(".aspx") ||
    name.endsWith(".jsp") ||
    name.endsWith(".wasm")
  ) {
    return true;
  }

  return false;
}

function normalizeOrigin(value = "") {
  return String(value || "").trim().replace(/\/+$/, "");
}

function getAllowedR2Origins() {
  return Array.from(new Set([
    normalizeOrigin(process.env.R2_PUBLIC_URL || "https://media.liotan.ru"),
    normalizeOrigin(process.env.LEGACY_R2_PUBLIC_URL || "https://media.liotan.com"),
    "https://media.liotan.ru",
    "https://media.liotan.com"
  ].filter(Boolean)));
}

function isAllowedR2Url(value = "") {
  const url = String(value || "");

  if (!url.startsWith("https://")) {
    return false;
  }

  try {
    const parsed = new URL(url);

    return (
      parsed.protocol === "https:" &&
      getAllowedR2Origins().includes(parsed.origin) &&
      !parsed.pathname.includes("..") &&
      !parsed.pathname.includes("\\")
    );
  } catch {
    return false;
  }
}

function isAllowedLocalUploadUrl(value = "") {
  const url = String(value || "");

  if (url.includes("..") || url.includes("\\")) {
    return false;
  }

  if (url.startsWith("/uploads/")) {
    return true;
  }

  return /^\/attachments\/[a-zA-Z0-9_-]{16,80}\/download$/.test(url);
}

function isAllowedAttachmentUrl(value = "") {
  return (
    isAllowedR2Url(value) ||
    isAllowedLocalUploadUrl(value)
  );
}

function safeNumber(value, fallback = 0, max = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    return fallback;
  }

  return Math.min(number, max);
}

function normalizeAttachmentType(type = "") {
  const value = String(type || "").toLowerCase();

  return ALLOWED_ATTACHMENT_TYPES.includes(value)
    ? value
    : "";
}

function expectedTypeForMime(mimeType = "") {
  const normalizedMime = normalizeMime(mimeType);

  if (normalizedMime.startsWith("image/")) {
    return "photo";
  }

  if (normalizedMime.startsWith("video/")) {
    return "video";
  }

  if (normalizedMime.startsWith("audio/")) {
    return "audio";
  }

  return "file";
}


function safeString(value = "", max = 256) {
  return String(value || "").trim().slice(0, max);
}

function safeBase64String(value = "", max = 8192) {
  const text = safeString(value, max);
  return /^[a-zA-Z0-9+/=_-]*$/.test(text) ? text : "";
}

function validateE2eeMediaEnvelope(value, type) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const originalType = normalizeAttachmentType(value.originalType || "file");
  if (!originalType) {
    return null;
  }

  const envelope = {
    v: Number(value.v),
    prefix: safeString(value.prefix, 64),
    alg: safeString(value.alg, 64),
    kdf: safeString(value.kdf, 64),
    iter: safeNumber(value.iter, 0, 1000000),
    salt: safeBase64String(value.salt, 128),
    iv: safeBase64String(value.iv, 128),
    kid: safeString(value.kid, 160),
    metaIv: safeBase64String(value.metaIv, 128),
    meta: safeBase64String(value.meta, 16384),
    originalType
  };

  if (
    envelope.v !== 1 ||
    envelope.alg !== "AES-GCM-256" ||
    envelope.kdf !== "PBKDF2-SHA256" ||
    envelope.iter < 100000 ||
    !envelope.salt ||
    !envelope.iv ||
    !envelope.metaIv ||
    !envelope.meta ||
    envelope.salt.length > 64 ||
    envelope.iv.length > 64 ||
    envelope.metaIv.length > 64 ||
    envelope.meta.length > 16384
  ) {
    return null;
  }

  return envelope;
}

function sanitizeAttachment(input) {
  if (!input || typeof input !== "object") {
    return null;
  }

  const url = String(input.url || "").trim();
  const type = normalizeAttachmentType(input.type);
  const mimeType = normalizeMime(input.mimeType || "application/octet-stream");
  const size = safeNumber(input.size, 0, MAX_ATTACHMENT_SIZE);
  const name = sanitizeFileName(input.name || SAFE_NAME_FALLBACK);

  if (!type || !url || !isAllowedAttachmentUrl(url)) {
    return null;
  }

  if (size > MAX_ATTACHMENT_SIZE) {
    return null;
  }

  if (isDangerousName(name)) {
    return null;
  }

  if (mimeType && ALLOWED_ATTACHMENT_MIME.includes(mimeType)) {
    const expectedType = expectedTypeForMime(mimeType);

    if (
      expectedType !== type &&
      !(type === "voice" && (expectedType === "audio" || expectedType === "file"))
    ) {
      return null;
    }
  }

  const e2eeMedia = validateE2eeMediaEnvelope(input.e2eeMedia, type);
  const encryptedClientView = Boolean(e2eeMedia);

  if (encryptedClientView) {
    if (mimeType !== "application/octet-stream") {
      return null;
    }

    if (type !== "file") {
      return null;
    }

    if (!/^\/attachments\/[a-zA-Z0-9_-]{16,80}\/download$/.test(url)) {
      return null;
    }
  } else if (
    mimeType &&
    !isAllowedAttachment({
      mimeType,
      fileName: name,
      size
    })
  ) {
    return null;
  }

  const sanitized = {
    url,
    type,
    name: encryptedClientView ? "Liotan encrypted media" : name,
    mimeType,
    size: encryptedClientView ? 0 : size,
    width: encryptedClientView ? 0 : safeNumber(input.width, 0, 20000),
    height: encryptedClientView ? 0 : safeNumber(input.height, 0, 20000),
    duration: encryptedClientView ? 0 : safeNumber(input.duration, 0, 24 * 60 * 60),
    waveform: encryptedClientView ? [] : (Array.isArray(input.waveform)
      ? input.waveform.slice(0, 64).map(item => safeNumber(item, 0, 1))
      : []),
    uploadId: String(input.uploadId || input.mediaId || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80),
    mediaId: String(input.mediaId || input.uploadId || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80),
    storageKey: "",
    storageType: "auto",
    e2eeMedia
  };

  if (input.encrypted === true || input.isEncrypted === true) {
    sanitized.encrypted = true;
  }

  if (typeof input.e2ee === "object" && input.e2ee) {
    sanitized.e2ee = input.e2ee;
  }

  return sanitized;
}

function assertSafeAttachmentPayload(input) {
  const attachment = sanitizeAttachment(input);

  if (!attachment) {
    const err = new Error("unsafe attachment payload");
    err.status = 400;
    throw err;
  }

  return attachment;
}

module.exports = {
  sanitizeAttachment,
  assertSafeAttachmentPayload,
  sanitizeFileName,
  isAllowedAttachmentUrl,
  isDangerousName,
  validateE2eeMediaEnvelope,
  getExtension
};
