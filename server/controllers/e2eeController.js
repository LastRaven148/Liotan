const User =
  require("../models/User");

const E2EEKey =
  require("../models/E2EEKey");

const Group =
  require("../models/Group");

const Session =
  require("../models/Session");

const Message =
  require("../models/Messages");

const privacy =
  require("../config/privacy");

const {
  isValidUsername
} = require("../utils/validators");

const getChatId = require("../utils/getChatId");

function isValidConversationId(value) {
  return (
    isValidUsername(value) ||
    /^group:[a-fA-F0-9]{24}(?::v\d+)?$/.test(value) ||
    getPrivateConversationParticipants(value).length === 2
  );
}

function getPrivateConversationParticipants(value) {
  const conversationId =
    String(value || "").trim();

  if (
    !conversationId ||
    conversationId.startsWith("group:")
  ) {
    return [];
  }

  const participants = getChatId.getPrivateChatParticipants(conversationId);
  if (participants.length !== 2 || !participants.every(isValidUsername)) {
    return [];
  }
  return getChatId(participants[0], participants[1]) === conversationId
    ? participants
    : [];
}

function getSafeDeviceName(session, requester, targetUser) {
  if (requester === targetUser || privacy.exposeDeviceNamesToContacts) {
    return session.deviceName || "Device";
  }

  return "Device";
}

async function hasSharedPrivateConversation(requester, targetUser) {
  if (!requester || !targetUser || requester === targetUser) {
    return requester === targetUser;
  }

  const message =
    await Message.exists({
      chatType: "private",
      $or: [
        { from: requester, to: targetUser },
        { from: targetUser, to: requester }
      ]
    });

  return Boolean(message);
}

async function canReadTargetDevices(requester, targetUser) {
  if (requester === targetUser) {
    return true;
  }

  return hasSharedPrivateConversation(requester, targetUser);
}

function emptyDeviceList(username = "") {
  return {
    username: privacy.exposeE2eeUserEnumeration ? username : "",
    devices: []
  };
}

async function canAccessConversation({
  conversationId,
  username
}) {
  if (conversationId === username) {
    return true;
  }

  if (conversationId.startsWith("group:")) {
    const groupId =
      conversationId
        .slice("group:".length)
        .split(":v")[0];

    const group =
      await Group.findById(groupId, "members");

    return Boolean(
      group &&
      group.members.includes(username)
    );
  }

  const participants =
    getPrivateConversationParticipants(conversationId);

  if (!participants.length) {
    return false;
  }

  return participants.includes(username);
}

async function getDeviceIdentities(req, res, next) {
  try {
    const username =
      String(req.params.username || "").trim();

    if (!isValidUsername(username)) {
      return res.status(400).json({
        error: "invalid username"
      });
    }

    const requester =
      req.user.username;

    const canReadDevices =
      await canReadTargetDevices(requester, username);

    if (!canReadDevices) {
      return res.json(emptyDeviceList(username));
    }

    const sessions =
      await Session.find(
        {
          username,
          revokedAt: null,
          devicePublicKey: {
            $ne: null
          }
        },
        "deviceName devicePublicKey lastSeenAt createdAt deviceKeyFingerprint"
      )
        .sort({
          lastSeenAt: -1
        })
        .limit(20)
        .lean();

    res.json({
      username,
      devices: sessions.map(session => ({
        deviceName: getSafeDeviceName(session, requester, username),
        publicKey: session.devicePublicKey,
        fingerprint: session.deviceKeyFingerprint || "",
        ...(privacy.minimalLogs ? {} : { lastSeenAt: session.lastSeenAt, createdAt: session.createdAt })
      }))
    });
  } catch (err) {
    next(err);
  }
}

async function getIdentity(req, res, next) {
  try {
    const username =
      String(req.params.username || "").trim();

    if (!isValidUsername(username)) {
      return res.status(400).json({
        error: "invalid username"
      });
    }

    const requester = req.user.username;
    const allowed = await canReadTargetDevices(requester, username);

    if (!allowed) {
      return res.json({
        username: privacy.exposeE2eeUserEnumeration ? username : "",
        publicKey: null
      });
    }

    const user =
      await User.findOne(
        { username },
        "username e2eePublicKey"
      ).lean();

    if (!user) {
      return res.json({
        username: privacy.exposeE2eeUserEnumeration ? username : "",
        publicKey: null
      });
    }

    res.json({
      username: user.username,
      publicKey: user.e2eePublicKey || null
    });
  } catch (err) {
    next(err);
  }
}

async function getIdentities(req, res, next) {
  try {
    const users =
      Array.isArray(req.body.users)
        ? req.body.users
            .map(item => String(item || "").trim())
            .filter(isValidUsername)
        : [];

    const uniqueUsers =
      [...new Set(users)].slice(0, 100);

    const found =
      await User.find(
        {
          username: {
            $in: uniqueUsers
          }
        },
        "username e2eePublicKey"
      ).lean();

    const foundMap = new Map(
      found.map(user => [
        user.username,
        user.e2eePublicKey || null
      ])
    );

    res.json({
      users: privacy.exposeE2eeUserEnumeration
        ? found.map(user => ({
            username: user.username,
            publicKey: user.e2eePublicKey || null
          }))
        : uniqueUsers.map(username => ({
            username,
            publicKey: foundMap.get(username) || null
          }))
    });
  } catch (err) {
    next(err);
  }
}

async function getConversationKey(req, res, next) {
  try {
    const username =
      req.user.username;

    const conversationId =
      String(req.params.conversationId || "").trim();

    if (!isValidConversationId(conversationId)) {
      return res.status(400).json({
        error: "invalid conversation"
      });
    }

    const allowed =
      await canAccessConversation({
        conversationId,
        username
      });

    if (!allowed) {
      return res.status(403).json({
        error: "access denied"
      });
    }

    const key =
      await E2EEKey.findOne({
        conversationId,
        user: username
      }, "conversationId user sender wrappedKey iv alg version commitId updatedAt").lean();

    res.json({
      key: key || null
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getIdentity,
  getIdentities,
  getConversationKey,
  getDeviceIdentities
};
