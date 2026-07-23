const COOKIE_NAME = process.env.AUTH_COOKIE_NAME ||
  (process.env.NODE_ENV === "production" ? "__Host-liotan_auth" : "liotan_auth");
const COOKIE_DOMAIN = String(process.env.AUTH_COOKIE_DOMAIN || process.env.COOKIE_DOMAIN || "").trim();
const COOKIE_MAX_AGE_MS = Number(process.env.AUTH_COOKIE_MAX_AGE_MS) || 7 * 24 * 60 * 60 * 1000;

function findCookie(header = "", expectedName = "") {
  for (const rawPart of String(header || "").split(";")) {
    const part = rawPart.trim();
    const index = part.indexOf("=");
    if (index <= 0 || part.slice(0, index).trim() !== expectedName) continue;
    const value = part.slice(index + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return "";
}

function getAuthCookie(req) {
  return findCookie(req.headers.cookie || "", COOKIE_NAME);
}

function getCookieOptions() {
  const isProduction = process.env.NODE_ENV === "production";

  const options = {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE_MS
  };

  if (COOKIE_DOMAIN) {
    options.domain = COOKIE_DOMAIN;
  }

  return options;
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, getCookieOptions());
}

function clearAuthCookie(res) {
  const options = {
    ...getCookieOptions()
  };

  delete options.maxAge;

  res.clearCookie(COOKIE_NAME, options);
}

module.exports = {
  COOKIE_NAME,
  getAuthCookie,
  setAuthCookie,
  clearAuthCookie
};
