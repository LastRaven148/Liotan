function sanitizeValue(value) {

  if (
    Array.isArray(value)
  ) {
    return value.map(
      sanitizeValue
    );
  }

  if (
    value &&
    typeof value === "object"
  ) {
    const clean = {};

    for (
      const key of Object.keys(value)
    ) {

      if (
        key.startsWith("$") ||
        key.includes(".") ||
        key === "__proto__" ||
        key === "constructor" ||
        key === "prototype"
      ) {
        continue;
      }

      clean[key] =
        sanitizeValue(
          value[key]
        );
    }

    return clean;
  }

  return value;
}

function mongoSanitize(
  req,
  res,
  next
) {

  if (req.body) {
    req.body =
      sanitizeValue(
        req.body
      );
  }

  if (req.params) {
    req.params =
      sanitizeValue(
        req.params
      );
  }

  next();

}

module.exports =
  mongoSanitize;