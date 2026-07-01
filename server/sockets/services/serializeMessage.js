function serializeAttachment(attachment) {
  if (!attachment?.url) return undefined;

  return {
    url: attachment.url || "",
    name: attachment.name || "",
    type: attachment.type || "",
    mimeType: attachment.mimeType || "",
    size: attachment.size || 0,
    width: attachment.width || 0,
    height: attachment.height || 0,
    duration: attachment.duration || 0,
    waveform: Array.isArray(attachment.waveform) ? attachment.waveform : [],
    e2eeMedia: attachment.e2eeMedia || null
  };
}

function serializeMessage(message) {
  if (!message) return message;
  const plain = typeof message.toObject === "function" ? message.toObject() : { ...message };

  if (plain.attachment) {
    plain.attachment = serializeAttachment(plain.attachment);
  }

  return plain;
}

function serializeMessages(messages = []) {
  return messages.map(serializeMessage);
}

module.exports = {
  serializeAttachment,
  serializeMessage,
  serializeMessages
};
