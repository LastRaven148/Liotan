const User =
  require("../models/User");

const {
  isValidUsername
} = require("../utils/validators");

function escapeRegex(value) {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

function isValidChatKey(value) {

  if (isValidUsername(value)) {
    return true;
  }

  return /^group:[a-fA-F0-9]{24}$/.test(value);

}

async function searchUsers(req, res, next) {
  try {
    const currentUsername =
      req.user.username;

    const query =
      String(req.query.q || "").trim();

    if (
      query.length < 1 ||
      query.length > 15 ||
      !/^[a-zA-Z0-9_]+$/.test(query)
    ) {
      return res.json([]);
    }

    const escaped =
      escapeRegex(query);

    const exact =
      await User.findOne(
        {
          $and: [
            {
              username: {
                $regex: `^${escaped}$`,
                $options: "i"
              }
            },
            {
              username: {
                $ne: currentUsername
              }
            }
          ]
        },
        "username displayName avatar bio"
      );

    if (exact) {
      return res.json([exact]);
    }

    const users =
      await User.find(
        {
          $and: [
            {
              username: {
                $regex: `^${escaped}`,
                $options: "i"
              }
            },
            {
              username: {
                $ne: currentUsername
              }
            }
          ]
        },
        "username displayName avatar bio"
      ).limit(20);

    res.json(users);
  } catch (err) {
    next(err);
  }
}

async function getPinnedChats(req, res, next) {
  try {
    const user =
      await User.findOne(
        { username: req.user.username },
        "pinnedChats"
      );

    res.json({
      pinnedChats: user?.pinnedChats || []
    });
  } catch (err) {
    next(err);
  }
}

async function togglePinnedChat(req, res, next) {
  try {
    const username =
      req.user.username;

    const chatKey =
      String(req.body.username || "").trim();

    if (!isValidChatKey(chatKey)) {
      return res.status(400).json({
        error: "invalid chat"
      });
    }

    const user =
      await User.findOne({ username });

    if (!user) {
      return res.status(404).json({
        error: "not found"
      });
    }

    const current =
      user.pinnedChats || [];

    user.pinnedChats =
      current.includes(chatKey)
        ? current.filter(item => item !== chatKey)
        : [chatKey, ...current];

    await user.save();

    res.json({
      pinnedChats: user.pinnedChats
    });
  } catch (err) {
    next(err);
  }
}

async function getArchivedChats(req, res, next) {
  try {
    const user =
      await User.findOne(
        { username: req.user.username },
        "archivedChats"
      );

    res.json({
      archivedChats: user?.archivedChats || []
    });
  } catch (err) {
    next(err);
  }
}

async function toggleArchivedChat(req, res, next) {
  try {
    const username =
      req.user.username;

    const chatKey =
      String(req.body.username || "").trim();

    if (!isValidChatKey(chatKey)) {
      return res.status(400).json({
        error: "invalid chat"
      });
    }

    const user =
      await User.findOne({ username });

    if (!user) {
      return res.status(404).json({
        error: "not found"
      });
    }

    const current =
      user.archivedChats || [];

    user.archivedChats =
      current.includes(chatKey)
        ? current.filter(item => item !== chatKey)
        : [chatKey, ...current];

    await user.save();

    res.json({
      archivedChats: user.archivedChats
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  searchUsers,
  getPinnedChats,
  togglePinnedChat,
  getArchivedChats,
  toggleArchivedChat
};
