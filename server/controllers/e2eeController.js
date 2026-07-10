const User =
  require("../models/User");

const E2EEKey =
  require("../models/E2EEKey");

const E2EEConversation = require("../models/E2EEConversation");

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

function isValidPublicKey(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    value.kty === "EC" &&
    value.crv === "P-256" &&
    typeof value.x === "string" &&
    value.x.length > 20 &&
    value.x.length < 200 &&
    typeof value.y === "string" &&
    value.y.length > 20 &&
    value.y.length < 200
  );
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

function cleanWrappedKey(key) {
  return {
    user: key.user,
    sender: key.sender,
    wrappedKey: key.wrappedKey,
    iv: key.iv,
    commitId: key.commitId,
    alg: String(key.alg || "ECDH-P256-AES-GCM").slice(0, 100)
  };
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
    value.iv.length < 500 &&
    typeof value.commitId === "string" &&
    /^[a-zA-Z0-9_-]{40,80}$/.test(value.commitId)
  );
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

async function getAllowedConversationParticipants({
  conversationId,
  username
}) {
  if (conversationId === username) {
    return [username];
  }

  if (conversationId.startsWith("group:")) {
    const groupId =
      conversationId
        .slice("group:".length)
        .split(":v")[0];

    const group =
      await Group.findById(groupId, "members").lean();

    if (
      !group ||
      !group.members.includes(username)
    ) {
      return [];
    }

    return group.members;
  }

  const participants =
    getPrivateConversationParticipants(conversationId);

  if (!participants.includes(username)) {
    return [];
  }

  return participants;
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

    const user = await User.findOne({ username }, "e2eePublicKey");
    if (!user) return res.status(404).json({ error: "user not found" });

    const current = user.e2eePublicKey;
    const sameKey = current && ["kty", "crv", "x", "y"].every(field => current[field] === publicKey[field]);
    if (current && !sameKey) {
      return res.status(409).json({ error: "identity change requires verified device transfer" });
    }

    user.e2eePublicKey = publicKey;
    await user.save();

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
      backup: null,
      publicKey: user?.e2eePublicKey || null
    });
  } catch (err) {
    next(err);
  }
}

async function setIdentityBackup(req, res, next) {
  res.status(410).json({
    error: "password-encrypted identity backup disabled",
    recoveryRequired: true
  });
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

    if (conversationId.startsWith("group:")) {
      const match = conversationId.match(/^group:([a-fA-F0-9]{24}):v(\d+)$/);
      const group = match ? await Group.findById(match[1], "e2eeVersion members").lean() : null;
      if (
        !group ||
        !group.members.includes(username) ||
        Number(match[2]) !== (Number(group.e2eeVersion) || 1)
      ) {
        return res.status(409).json({ error: "only current group epoch can be committed" });
      }
    }

    const allowedParticipants =
      await getAllowedConversationParticipants({
        conversationId,
        username
      });

    if (!allowedParticipants.length) {
      return res.status(403).json({
        error: "access denied"
      });
    }

    const allowedUsers =
      new Set(allowedParticipants);

    const keys =
      Array.isArray(req.body.keys)
        ? req.body.keys
            .filter(isValidWrappedKey)
            .filter(key =>
              key.sender === username &&
              allowedUsers.has(key.user)
            )
            .slice(0, 100)
            .map(cleanWrappedKey)
        : [];

    const expectedUsers = [...allowedUsers].sort();
    const submittedUsers = [...new Set(keys.map(key => key.user))].sort();
    const commitIds = [...new Set(keys.map(key => key.commitId))];
    if (
      keys.length !== expectedUsers.length ||
      submittedUsers.length !== expectedUsers.length ||
      submittedUsers.some((user, index) => user !== expectedUsers[index]) ||
      commitIds.length !== 1
    ) {
      return res.status(400).json({ error: "complete atomic key set required" });
    }

    let commit;
    try {
      commit = await E2EEConversation.findOneAndUpdate(
        { conversationId },
        {
          $setOnInsert: {
            conversationId,
            commitId: commitIds[0],
            participants: expectedUsers,
            createdBy: username
          }
        },
        { upsert: true, new: true }
      ).lean();
    } catch (err) {
      if (err?.code !== 11000) throw err;
      commit = await E2EEConversation.findOne({ conversationId }).lean();
    }

    if (!commit || commit.commitId !== commitIds[0]) {
      return res.status(409).json({ error: "conversation key already committed" });
    }

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
            commitId: key.commitId,
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
