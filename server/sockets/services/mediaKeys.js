function attachmentMediaKeys(attachment) {
  if (!attachment) return [];

  return [
    attachment.mediaId,
    attachment.uploadId,
    attachment.url
  ].filter(Boolean).map(String);
}

function messagesMediaKeys(messages = []) {
  const keys = [];

  for (const message of messages || []) {
    keys.push(...attachmentMediaKeys(message?.attachment));
  }

  return [...new Set(keys)];
}

module.exports = {
  attachmentMediaKeys,
  messagesMediaKeys
};
