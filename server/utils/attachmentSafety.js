const path = require("path");

const CLOUDINARY_FORMATS = {
  photo: ["jpg", "jpeg", "png", "webp"],
  video: ["mp4", "webm", "mov"],
  audio: ["mp3", "m4a", "aac", "ogg", "wav", "webm"],
  file: ["pdf", "txt", "zip", "7z", "rar", "liotan", "liotanenc", "liotanmedia", "liotanvoice"]
};

function sanitizeAttachmentName(value) {
  const raw = String(value || "file")
    .replace(/[\\/]/g, "_")
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "_")
    .replace(/\s+/g, " ")
    .trim();

  const safe = raw || "file";
  const base = path.basename(safe).replace(/^\.+/, "");
  return (base || "file").slice(0, 160);
}

function getCloudinaryAllowedFormats(type) {
  return CLOUDINARY_FORMATS[type] || CLOUDINARY_FORMATS.file;
}

module.exports = {
  sanitizeAttachmentName,
  getCloudinaryAllowedFormats
};
