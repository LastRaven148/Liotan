const express =
  require("express");

const {
  cleanupUploadsRoute
} = require("../controllers/adminController");

const router =
  express.Router();

router.post(
  "/admin/cleanup-uploads",
  cleanupUploadsRoute
);

module.exports =
  router;