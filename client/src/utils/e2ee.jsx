// MLS v4-only UI facade. Legacy payloads are recognized solely to fail closed;
// no v3 key derivation, decryption, or private-key delivery remains reachable.
import { decryptMlsMediaBlob } from "../crypto/mlsEngine";

const LEGACY_TEXT_PREFIXES = ["__LIOTAN_E2EE_", "__LIOTAN_VOICE_"];

export function getEffectiveE2EEChatKey(chatKey) {
  return String(chatKey || "");
}

export function isEncryptedText(value) {
  return typeof value === "string" && LEGACY_TEXT_PREFIXES.some(prefix => value.startsWith(prefix));
}

export function isEncryptedAttachment(attachment) {
  return Boolean(attachment?.mlsMedia?.v === 1 || attachment?.e2eeMedia);
}

export async function decryptTextForChat({ text = "", encryptedContent = null }) {
  if (encryptedContent?.ciphertext || isEncryptedText(text)) return "";
  return String(text || "");
}

export async function decryptAttachmentMetadataForChat({ attachment }) {
  if (attachment?.mlsMedia?.v !== 1) return null;
  const original = attachment.mlsMedia.original;
  return original ? {
    originalName: original.name,
    originalType: original.type,
    originalMimeType: original.mimeType,
    originalSize: original.size,
    duration: original.duration || 0,
    waveform: original.waveform || [],
    width: original.width || 0,
    height: original.height || 0
  } : null;
}

export async function decryptAttachmentBlobForChat({ attachment, blob }) {
  if (attachment?.mlsMedia?.v === 1) return decryptMlsMediaBlob(attachment, blob);
  if (attachment?.e2eeMedia) throw new Error("Legacy encrypted media is quarantined; MLS v4 is required");
  return blob;
}
