"use strict";

const crypto = require("node:crypto");
const ClientInvalidation = require("../models/ClientInvalidation");
const CryptoDevice = require("../models/CryptoDevice");
const UserNotificationSettings = require("../models/UserNotificationSettings");
const { userRoom } = require("../sockets/sessionRegistry");
const { runMongoTransaction } = require("../utils/mongoTransaction");

const FIELDS = Object.freeze([
  "desktopEnabled",
  "soundEnabled",
  "sentSoundEnabled",
  "receivedSoundEnabled",
  "privateChatsEnabled",
  "groupsEnabled",
  "volume"
]);

function view(settings) {
  return {
    version: Number(settings.version),
    desktopEnabled: settings.desktopEnabled,
    soundEnabled: settings.soundEnabled,
    sentSoundEnabled: settings.sentSoundEnabled,
    receivedSoundEnabled: settings.receivedSoundEnabled,
    privateChatsEnabled: settings.privateChatsEnabled,
    groupsEnabled: settings.groupsEnabled,
    volume: settings.volume,
    updatedAt: settings.updatedAt
  };
}

async function readOrCreate(userId, session = null) {
  return UserNotificationSettings.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true, session }
  );
}

function validatePatch(body) {
  if (!body || Array.isArray(body) || typeof body !== "object") throw new TypeError("invalid notification settings");
  const expectedVersion = Number(body.expectedVersion);
  const settings = body.settings;
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1 || !settings || Array.isArray(settings) || typeof settings !== "object") {
    throw new TypeError("invalid notification settings");
  }
  const keys = Object.keys(settings);
  if (!keys.length || keys.some(key => !FIELDS.includes(key))) throw new TypeError("invalid notification settings");
  const update = {};
  for (const key of keys) {
    switch (key) {
      case "desktopEnabled":
        if (typeof settings.desktopEnabled !== "boolean") throw new TypeError("invalid notification settings");
        update.desktopEnabled = settings.desktopEnabled;
        break;
      case "soundEnabled":
        if (typeof settings.soundEnabled !== "boolean") throw new TypeError("invalid notification settings");
        update.soundEnabled = settings.soundEnabled;
        break;
      case "sentSoundEnabled":
        if (typeof settings.sentSoundEnabled !== "boolean") throw new TypeError("invalid notification settings");
        update.sentSoundEnabled = settings.sentSoundEnabled;
        break;
      case "receivedSoundEnabled":
        if (typeof settings.receivedSoundEnabled !== "boolean") throw new TypeError("invalid notification settings");
        update.receivedSoundEnabled = settings.receivedSoundEnabled;
        break;
      case "privateChatsEnabled":
        if (typeof settings.privateChatsEnabled !== "boolean") throw new TypeError("invalid notification settings");
        update.privateChatsEnabled = settings.privateChatsEnabled;
        break;
      case "groupsEnabled":
        if (typeof settings.groupsEnabled !== "boolean") throw new TypeError("invalid notification settings");
        update.groupsEnabled = settings.groupsEnabled;
        break;
      case "volume":
        if (!Number.isInteger(settings.volume) || settings.volume < 0 || settings.volume > 100) {
          throw new TypeError("invalid notification settings");
        }
        update.volume = settings.volume;
        break;
      default:
        throw new TypeError("invalid notification settings");
    }
  }
  return { expectedVersion, update };
}

async function createUpdateInvalidation(req, settings, session) {
  const devices = await CryptoDevice.find({
    userId: req.user.userId,
    status: "active",
    manifestExpiresAt: { $gt: new Date() }
  }, "clientId").session(session).lean();
  const [invalidation] = await ClientInvalidation.create([{
    eventId: crypto.randomBytes(24).toString("base64url"),
    recipientUserId: req.user.userId,
    kind: "notification-settings-updated",
    payloadVersion: settings.version,
    pendingClientIds: devices.map(device => device.clientId)
  }], { session });
  return invalidation;
}

function emitUpdate(req, invalidation, settings) {
  req.app.get("io")?.to(userRoom(String(req.user.userId))).emit("clientInvalidationAvailable", {
    eventId: invalidation.eventId,
    kind: invalidation.kind,
    version: settings.version
  });
}

async function getNotificationSettings(req, res, next) {
  try {
    return res.json(view(await readOrCreate(req.user.userId)));
  } catch (error) {
    return next(error);
  }
}

async function updateNotificationSettings(req, res, next) {
  try {
    const { expectedVersion, update } = validatePatch(req.body);
    let settings;
    let current;
    let invalidation;
    await runMongoTransaction(async session => {
      await readOrCreate(req.user.userId, session);
      settings = await UserNotificationSettings.findOneAndUpdate(
        { userId: req.user.userId, version: expectedVersion },
        { $set: update, $inc: { version: 1 } },
        { returnDocument: "after", runValidators: true, session }
      );
      if (!settings) {
        current = await UserNotificationSettings.findOne({ userId: req.user.userId }).session(session);
        return;
      }
      invalidation = await createUpdateInvalidation(req, settings, session);
    });
    if (!settings) {
      return res.status(409).json({
        error: "notification settings changed on another device",
        current: view(current)
      });
    }
    emitUpdate(req, invalidation, settings);
    return res.json(view(settings));
  } catch (error) {
    if (error instanceof TypeError || error?.name === "ValidationError") return res.status(400).json({ error: "invalid notification settings" });
    return next(error);
  }
}

module.exports = { FIELDS, getNotificationSettings, updateNotificationSettings, validatePatch, view };
