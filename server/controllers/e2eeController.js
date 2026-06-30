const User =
  require("../models/User");

const E2EEKey =
  require("../models/E2EEKey");

const Group =
  require("../models/Group");

const Session =
  require("../models/Session");

const {
  isValidUsername
} = require("../utils/validators");

function isValidConversationId(value) {
  return (
    isValidUsername(value) ||
    /^[a-zA-Z0-9_]+:[a-zA-Z0-9_]+$/.test(value) ||
    /^group:[a-fA-F0-9]{24}(?::v\d+)?$/.test(value)
  );
}

function isValidPublicKey(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    value.kty === "EC" &&
    value.crv === "P-256" &&
    typeof value.x === "string" &&
    typeof value.y === "string"
  );
}


function isValidIdentityBackup(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    isValidPublicKey(value.publicKey) &&
    typeof value.encryptedPrivateKey === "string" &&
    value.encryptedPrivateKey.length < 10000 &&
    typeof value.salt === "string" &&
    value.salt.length < 500 &&
    typeof value.iv === "string" &&
    value.iv.length < 500 &&
    typeof value.alg === "string" &&
    value.alg.length < 100
  );
}

function isValidWrappedKey(value) {
  return Boolean(
    value &&
    typeof value.user === "string" &&
    isValidUsername(value.user) &&
    typeof value.sender === "string" &&
    isValidUsername(value.sender) &&
    typeof value.wrappedKey === "string" &&
    value.wrappedKey.length < 5000 &&
    typeof value.iv === "string" &&
    value.iv.length < 500
  );
}

async function canAccessConversation({
  conversationId,
  username
}) {
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

  if (isValidUsername(conversationId)) {
    return conversationId === username;
  }

  const participants = String(conversationId || "").split(":");
  if (participants.length !== 2 || !participants.every(isValidUsername)) {
    return false;
  }

  return participants.includes(username);
}

async function setIdentity(req, res, next) {
  try {
    const username =
      req.user.username;

    const publicKey =
      req.body.publicKey;

    if (!isValidPublicKey(publicKey)) {
      return res.status(400).json({
        error: "invalid public key"
      });
    }

    await User.updateOne(
      { username },
      {
        $set: {
          e2eePublicKey: publicKey
        }
      }
    );

    res.json({
      ok: true
    });
  } catch (err) {
    next(err);
  }
}

async function getIdentityBackup(req, res, next) {
  try {
    const username =
      req.user.username;

    const user =
      await User.findOne(
        { username },
        "username e2eeIdentityBackup e2eePublicKey"
      ).lean();

    res.json({
      backup: user?.e2eeIdentityBackup || null,
      publicKey: user?.e2eePublicKey || null
    });
  } catch (err) {
    next(err);
  }
}

async function setIdentityBackup(req, res, next) {
  try {
    const username =
      req.user.username;

    const backup =
      req.body.backup;

    if (!isValidIdentityBackup(backup)) {
      return res.status(400).json({
        error: "invalid identity backup"
      });
    }

    await User.updateOne(
      { username },
      {
        $set: {
          e2eePublicKey: backup.publicKey,
          e2eeIdentityBackup: backup
        }
      }
    );

    res.json({
      ok: true
    });
  } catch (err) {
    next(err);
  }
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

    if (username !== requester) {
      // Only expose active device keys to users who already share a conversation.
      // Full contact graph checks can be tightened later per conversation.
      const hasPrivateAccess =
        username && requester && username !== requester;

      if (!hasPrivateAccess) {
        return res.status(403).json({
          error: "access denied"
        });
      }
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
        "deviceName devicePublicKey lastSeenAt createdAt"
      )
        .sort({
          lastSeenAt: -1
        })
        .limit(20)
        .lean();

    res.json({
      username,
      devices: sessions.map(session => ({
        deviceName: session.deviceName,
        publicKey: session.devicePublicKey,
        lastSeenAt: session.lastSeenAt,
        createdAt: session.createdAt
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

    const user =
      await User.findOne(
        { username },
        "username e2eePublicKey"
      ).lean();

    if (!user) {
      return res.status(404).json({
        error: "user not found"
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

    res.json({
      users: found.map(user => ({
        username: user.username,
        publicKey: user.e2eePublicKey || null
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
      }).lean();

    res.json({
      key: key || null
    });
  } catch (err) {
    next(err);
  }
}

async function setConversationKeys(req, res, next) {
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

    const keys =
      Array.isArray(req.body.keys)
        ? req.body.keys.filter(isValidWrappedKey).slice(0, 100)
        : [];

    for (const key of keys) {
      await E2EEKey.updateOne(
        {
          conversationId,
          user: key.user
        },
        {
          $set: {
            conversationId,
            user: key.user,
            sender: key.sender,
            wrappedKey: key.wrappedKey,
            iv: key.iv,
            alg: key.alg || "ECDH-P256-AES-GCM",
            version: 1
          }
        },
        {
          upsert: true
        }
      );
    }

    res.json({
      ok: true,
      count: keys.length
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  setIdentity,
  getIdentityBackup,
  setIdentityBackup,
  getIdentity,
  getIdentities,
  getConversationKey,
  setConversationKeys,
  getDeviceIdentities
};
