function notFoundHandler(req, res) {
  res.status(404).json({
    error: "not found"
  });
}

module.exports = notFoundHandler;
