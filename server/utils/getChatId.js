function getChatId(a, b) {
  const participants = [String(a || ""), String(b || "")].sort();
  return `private:v2:${participants[0]}:${participants[1]}`;
}

function getPrivateChatParticipants(value) {
  const parts = String(value || "").split(":");
  if (parts.length !== 4 || parts[0] !== "private" || parts[1] !== "v2") {
    return [];
  }
  return [parts[2], parts[3]];
}

function getLegacyChatId(a, b) {
  return [String(a || ""), String(b || "")].sort().join("_");
}

getChatId.getPrivateChatParticipants = getPrivateChatParticipants;
getChatId.getLegacyChatId = getLegacyChatId;

module.exports = getChatId;
