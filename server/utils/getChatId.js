function getChatId(a, b) {
  return [a, b]
    .sort()
    .join("_");
}

module.exports = getChatId;