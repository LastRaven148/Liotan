// Compatibility facade. New writes are MLS-only; all v3 code is isolated in
// the explicitly read-only legacy module so UI changes cannot enable it.
export {
  decryptAttachmentBlobForChat,
  decryptAttachmentMetadataForChat,
  decryptTextForChat,
  getEffectiveE2EEChatKey,
  isEncryptedAttachment,
  isEncryptedText
} from "../crypto/legacy/e2eeV3ReadOnly";
