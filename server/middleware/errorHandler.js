const logger =
  require("../utils/logger");

function getSafeMessage(err) {
  if (
    err?.status &&
    err.status < 500 &&
    err.message
  ) {
    return err.message;
  }

  return "server error";
}

function errorHandler(
  err,
  req,
  res,
  next
) {
  logger.error(
    "request failed",
    err,
    {
      method: req.method,
      path: req.path,
      status: err.status || 500
    }
  );

  res.status(
    err.status || 500
  ).json({
    error: getSafeMessage(err)
  });
}

module.exports =
  errorHandler;
