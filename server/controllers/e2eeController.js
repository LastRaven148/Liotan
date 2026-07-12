const User =
  require("../models/User");

const Session =
  require("../models/Session");

const Message =
  require("../models/Messages");

const privacy =
  require("../config/privacy");

const {
  isValidUsername
} = require("../utils/validators");

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

module.exports = {
  getIdentity,
  getIdentities,
  getDeviceIdentities
};
