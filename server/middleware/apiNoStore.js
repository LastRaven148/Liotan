function apiNoStore(req, res, next) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Cache-Control", "no-store");
  }

  next();
}

module.exports = apiNoStore;
