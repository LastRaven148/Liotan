const express =
  require("express");

const authMiddleware =
  require("../middleware/authMiddleware");

const {
  createGroup,
  getMyGroups,
  getGroupById
} = require("../controllers/groupController");

const router =
  express.Router();

router.post(
  "/groups",
  authMiddleware,
  createGroup
);

router.get(
  "/groups",
  authMiddleware,
  getMyGroups
);

router.get(
  "/groups/:id",
  authMiddleware,
  getGroupById
);

module.exports = router;