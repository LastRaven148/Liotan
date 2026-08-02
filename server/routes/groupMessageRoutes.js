const express =
  require("express");

const authMiddleware =
  require("../middleware/authMiddleware");

const router =
  express.Router();

function legacyGroupHistoryGone(_req, res) {
  return res.status(410).json({
    error: "legacy group history retired; MLS v4 required",
    protocol: "mls-1.0"
  });
}

router.get(
  "/groups/:id/messages",
  authMiddleware,
  legacyGroupHistoryGone
);

module.exports =
  router;
