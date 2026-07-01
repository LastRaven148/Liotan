function normalizeText(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function isValidUsername(username) {
  const value =
    normalizeText(username);

  return (
    value.length >= 3 &&
    value.length <= 15 &&
    /^[a-zA-Z0-9_]+$/.test(value)
  );
}

function isValidDisplayName(displayName) {
  const value =
    normalizeText(displayName);

  return value.length <= 20;
}

function isValidPassword(password) {
  return (
    typeof password === "string" &&
    password.length >= 8 &&
    password.length <= 64
  );
}

function isValidEmail(email) {
  return (
    typeof email === "string" &&
    email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  );
}

function isValidEmailCode(code) {
  return (
    typeof code === "string" &&
    /^\d{8}$/.test(code.trim())
  );
}

function isValidBio(bio) {
  return (
    typeof bio === "string" &&
    bio.trim().length <= 50
  );
}

function isValidMessage(text) {
  return (
    typeof text === "string" &&
    text.trim().length > 0 &&
    text.trim().length <= 3000
  );
}

module.exports = {
  normalizeText,
  isValidUsername,
  isValidDisplayName,
  isValidPassword,
  isValidEmail,
  isValidEmailCode,
  isValidBio,
  isValidMessage
};