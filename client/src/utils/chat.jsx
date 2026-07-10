export function getChatId(a, b) {
  const participants = [String(a || ""), String(b || "")].sort();
  return `private:v2:${participants[0]}:${participants[1]}`;
}
