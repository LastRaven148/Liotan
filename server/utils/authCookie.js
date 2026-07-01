const COOKIE_NAME = process.env.AUTH_COOKIE_NAME || "liotan_auth";
const COOKIE_DOMAIN = String(process.env.AUTH_COOKIE_DOMAIN || "").trim();
const COOKIE_MAX_AGE_MS = Number(process.env.AUTH_COOKIE_MAX_AGE_MS) || 7 * 24 * 60 * 60 * 1000;

function parseCookies(header = "") {
  return String(header || "")
    .split(";")
    .map(part => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const index = part.indexOf("=");
      if (index <= 0) {
        return cookies;
      }

      const key = part.slice(0, index).trim();
      const value = part.slice(index + 1).trim();

      if (!key) {
        return cookies;
      }

      try {
        cookies[key] = decodeURIComponent(value);
      } catch {
        cookies[key] = value;
      }

      return cookies;
    }, {});
}

function getAuthCookie(req) {
  return parseCookies(req.headers.cookie || "")[COOKIE_NAME] || "";
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
  res.clearCookie(COOKIE_NAME, {
    ...getCookieOptions(),
    maxAge: undefined
  });
}

module.exports = {
  COOKIE_NAME,
  getAuthCookie,
  setAuthCookie,
  clearAuthCookie
};
