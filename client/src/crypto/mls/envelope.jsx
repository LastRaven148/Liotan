import { getChatId } from "../../utils/chat";
import { base64UrlToBytes } from "../encoding";
import {
  MEDIA_CHUNK_SIZES,
  MEDIA_MAGIC,
  MESSAGE_REFERENCE_RE,
  SAFE_MEDIA_MIMES,
  UUID_RE
} from "./constants";

export function safeMediaMime(file) {
  const mime = String(file?.type || "").split(";", 1)[0].trim().toLowerCase();
  return Object.values(SAFE_MEDIA_MIMES).some(values => values.has(mime))
    ? mime
    : "application/octet-stream";
}

export function mediaType(file, override = "") {
  const mime = safeMediaMime(file);
  if (override === "voice" && SAFE_MEDIA_MIMES.audio.has(mime)) return "voice";
  if (SAFE_MEDIA_MIMES.photo.has(mime)) return "photo";
  if (SAFE_MEDIA_MIMES.video.has(mime)) return "video";
  if (SAFE_MEDIA_MIMES.audio.has(mime)) return "audio";
  return "file";
}

export function assertMediaDescriptor(envelope, descriptor) {
  const originalSize = Number(descriptor?.original?.size);
  const chunkSize = Number(descriptor?.chunkSize);
  const expectedChunks = Math.max(1, Math.ceil(originalSize / chunkSize));
  const expectedBytes = MEDIA_MAGIC.length + expectedChunks * (chunkSize + 16);
  const originalType = descriptor?.original?.type;
  const originalMime = descriptor?.original?.mimeType;
  const originalWidth = Number(descriptor?.original?.width);
  const originalHeight = Number(descriptor?.original?.height);
  const mimeMatchesType = originalType === "file"
    ? originalMime === "application/octet-stream"
    : originalType === "voice"
      ? SAFE_MEDIA_MIMES.audio.has(originalMime)
      : SAFE_MEDIA_MIMES[originalType]?.has(originalMime);
  if (
    !descriptor || descriptor.v !== 1 ||
    descriptor.conversationId !== envelope.conversationId ||
    descriptor.messageId !== envelope.clientMessageId ||
    !/^[A-Za-z0-9_-]{16,80}$/.test(String(descriptor.uploadId || "")) ||
    !/^[A-Za-z0-9_-]{43}$/.test(String(descriptor.deleteToken || "")) ||
    !/^[A-Za-z0-9_-]{22,96}$/.test(String(descriptor.bindingId || "")) ||
    !/^[A-Za-z0-9_-]{43}$/.test(String(descriptor.ciphertextHash || "")) ||
    !Number.isSafeInteger(originalSize) || originalSize < 0 || originalSize > 100 * 1024 * 1024 ||
    !MEDIA_CHUNK_SIZES.includes(chunkSize) || descriptor.chunkSize !== chunkSize ||
    descriptor.chunks !== expectedChunks ||
    descriptor.ciphertextBytes !== expectedBytes ||
    typeof descriptor.key !== "string" || typeof descriptor.noncePrefix !== "string" ||
    !descriptor.original || typeof descriptor.original !== "object" ||
    typeof descriptor.original.name !== "string" || descriptor.original.name.length > 160 ||
    !["photo", "video", "audio", "voice", "file"].includes(originalType) ||
    typeof originalMime !== "string" || originalMime.length > 120 || !mimeMatchesType ||
    !Number.isFinite(Number(descriptor.original.duration)) || Number(descriptor.original.duration) < 0 ||
    !Array.isArray(descriptor.original.waveform) || descriptor.original.waveform.length > 64 ||
    descriptor.original.waveform.some(value => !Number.isFinite(Number(value))) ||
    !Number.isSafeInteger(originalWidth) || originalWidth < 0 || originalWidth > 16384 ||
    !Number.isSafeInteger(originalHeight) || originalHeight < 0 || originalHeight > 16384
  ) {
    throw new Error("Invalid authenticated MLS media descriptor");
  }
  base64UrlToBytes(descriptor.key, 32);
  base64UrlToBytes(descriptor.noncePrefix, 8);
}

export function assertEnvelopeSchema(envelope) {
  if (!envelope || Array.isArray(envelope) || typeof envelope !== "object" ||
    envelope.v !== 1 || !["message", "edit", "delete", "pin"].includes(envelope.kind) ||
    typeof envelope.conversationId !== "string" || !UUID_RE.test(String(envelope.clientMessageId || "")) ||
    typeof envelope.senderUsername !== "string" || !envelope.senderUsername || envelope.senderUsername.length > 80 ||
    typeof envelope.senderClientId !== "string" || !Number.isFinite(Date.parse(String(envelope.sentAt || ""))) ||
    typeof envelope.text !== "string" || envelope.text.length > 20000) {
    throw new Error("Invalid authenticated MLS envelope schema");
  }
  if (envelope.transparencyCheckpoint !== null &&
    envelope.transparencyCheckpoint !== undefined) {
    const evidence = envelope.transparencyCheckpoint;
    if (!evidence || typeof evidence !== "object" ||
      evidence.checkpoint?.v !== 1 ||
      !Number.isSafeInteger(Number(evidence.checkpoint?.treeSize)) ||
      Number(evidence.checkpoint.treeSize) < 1 ||
      !/^[A-Za-z0-9_-]{43}$/.test(String(evidence.checkpoint?.rootHash || "")) ||
      !/^[A-Za-z0-9_-]{43}$/.test(String(evidence.checkpointHash || "")) ||
      !/^[A-Za-z0-9_-]{86}$/.test(String(evidence.signature || "")) ||
      !/^[A-Za-z0-9_-]{43}$/.test(String(evidence.signingPublicKey || ""))) {
      throw new Error("Invalid key transparency gossip evidence");
    }
  }
  if (envelope.kind === "message") {
    if (envelope.targetMessageId !== undefined ||
      (envelope.replyTo !== null && envelope.replyTo !== undefined &&
        (!envelope.replyTo || typeof envelope.replyTo !== "object" ||
          !MESSAGE_REFERENCE_RE.test(String(envelope.replyTo.messageId || ""))))) {
      throw new Error("Invalid authenticated MLS message reference");
    }
    if (envelope.attachment !== null && envelope.attachment !== undefined) {
      assertMediaDescriptor(envelope, envelope.attachment);
    }
    return;
  }
  if (!MESSAGE_REFERENCE_RE.test(String(envelope.targetMessageId || "")) ||
    envelope.attachment !== undefined || envelope.replyTo !== undefined ||
    (envelope.kind !== "edit" && envelope.text !== "")) {
    throw new Error("Invalid authenticated MLS control event");
  }
  if (["edit", "delete"].includes(envelope.kind) && envelope.mutation !== undefined) {
    const mutation = envelope.mutation;
    if (!mutation || mutation.v !== 2 ||
      typeof mutation.targetSenderUsername !== "string" || !mutation.targetSenderUsername ||
      typeof mutation.targetSenderClientId !== "string" || !mutation.targetSenderClientId ||
      !Number.isFinite(Date.parse(String(mutation.targetSentAt || ""))) ||
      !Number.isSafeInteger(mutation.revision) || mutation.revision < 1 ||
      !MESSAGE_REFERENCE_RE.test(String(mutation.previousMutationId || ""))) {
      throw new Error("Invalid authenticated MLS mutation chain");
    }
  } else if (envelope.kind === "pin" && envelope.mutation !== undefined) {
    throw new Error("Invalid authenticated MLS pin event");
  }
}

export function envelopeToUiMessage(state, envelope, username, eventCreatedAt = "") {
  const isGroup = state.chatType === "group";
  const other = state.directory?.find(user => user.username !== username)?.username || username;
  const chatId = isGroup ? `group:${state.groupId}` : getChatId(username, other);
  const attachment = envelope.attachment ? {
    uploadId: envelope.attachment.uploadId,
    mediaId: envelope.attachment.uploadId,
    url: `/crypto/v4/media/${encodeURIComponent(envelope.attachment.uploadId)}`,
    name: envelope.attachment.original.name,
    type: envelope.attachment.original.type,
    mimeType: envelope.attachment.original.mimeType,
    size: envelope.attachment.original.size,
    duration: envelope.attachment.original.duration || 0,
    waveform: envelope.attachment.original.waveform || [],
    width: envelope.attachment.original.width || 0,
    height: envelope.attachment.original.height || 0,
    mlsMedia: envelope.attachment
  } : null;
  return {
    _id: envelope.clientMessageId,
    chatId,
    chatType: isGroup ? "group" : "private",
    groupId: isGroup ? state.groupId : null,
    from: envelope.senderUsername,
    to: isGroup ? "" : (envelope.senderUsername === username ? other : username),
    text: envelope.text || "",
    attachment,
    replyTo: envelope.replyTo || null,
    createdAt: eventCreatedAt || envelope.sentAt,
    status: "sent",
    mls: {
      conversationId: state.conversationId,
      senderClientId: envelope.senderClientId,
      mutationRevision: 0,
      lastMutationId: envelope.clientMessageId
    }
  };
}

export function dispatchCryptoMessage(detail) {
  window.dispatchEvent(new CustomEvent("liotan:mls-event", { detail }));
}
