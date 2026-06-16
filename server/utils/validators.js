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

function isValidPassword(password) {
  return (
    typeof password === "string" &&
    password.length >= 8 &&
    password.length <= 20
  );
}

function isValidBio(bio) {
  return (
    typeof bio === "string" &&
    bio.trim().length <= 100
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
  isValidPassword,
  isValidBio,
  isValidMessage
};