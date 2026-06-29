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

function isAllowedCloudinaryUrl(value = "") {
  const url = String(value || "");

  if (!url.startsWith("https://")) {
    return false;
  }

  try {
    const parsed = new URL(url);
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;

    if (parsed.protocol !== "https:") {
      return false;
    }

    if (!parsed.hostname.endsWith(".cloudinary.com")) {
      return false;
    }

    if (cloudName) {
      return parsed.pathname.includes(`/${cloudName}/`);
    }

    return parsed.hostname === "res.cloudinary.com";
  } catch {
    return false;
  }
}

function isAllowedLocalUploadUrl(value = "") {
  const url = String(value || "");

  if (!url.startsWith("/uploads/")) {
    return false;
  }

  if (url.includes("..") || url.includes("\\")) {
    return false;
  }

  return true;
}

function isAllowedAttachmentUrl(value = "") {
  return (
    isAllowedCloudinaryUrl(value) ||
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

  if (
    mimeType &&
    mimeType !== "application/octet-stream" &&
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
    name,
    mimeType,
    size,
    width: safeNumber(input.width, 0, 20000),
    height: safeNumber(input.height, 0, 20000),
    duration: safeNumber(input.duration, 0, 24 * 60 * 60),
    publicId: String(input.publicId || "").slice(0, 300),
    resourceType: String(input.resourceType || "auto").slice(0, 40),
    e2eeMedia: input.e2eeMedia && typeof input.e2eeMedia === "object"
      ? input.e2eeMedia
      : null
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
  getExtension
};
