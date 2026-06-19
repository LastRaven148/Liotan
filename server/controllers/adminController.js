const cleanupUploads =
  require("../scripts/cleanupUploadsTask");

async function cleanupUploadsRoute(
  req,
  res,
  next
) {

  try {

    if (
      req.headers["x-admin-secret"] !==
      process.env.ADMIN_SECRET
    ) {
      return res.status(403).json({
        error: "forbidden"
      });
    }

    const result =
      await cleanupUploads();

    res.json(result);

  } catch (err) {
    next(err);
  }

}

module.exports = {
  cleanupUploadsRoute
};