function securityHeaders(req, res, next) {
  res.setHeader(
    "X-Content-Type-Options",
    "nosniff"
  );

  res.setHeader(
    "X-Frame-Options",
    "DENY"
  );

  res.setHeader(
    "Referrer-Policy",
    "no-referrer"
  );

  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=()"
  );

  if (
    req.path.startsWith("/api") ||
    req.path.startsWith("/auth") ||
    req.path.startsWith("/login") ||
    req.path.startsWith("/register") ||
    req.path.startsWith("/password") ||
    req.path.startsWith("/e2ee")
  ) {
    res.setHeader(
      "Cache-Control",
      "no-store"
    );
  }

  next();
}

module.exports =
  securityHeaders;
