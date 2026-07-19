"use strict";

const mongoose = require("mongoose");

const userNotificationSettingsSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true, index: true },
  version: { type: Number, default: 1, min: 1 },
  desktopEnabled: { type: Boolean, default: true },
  soundEnabled: { type: Boolean, default: true },
  sentSoundEnabled: { type: Boolean, default: true },
  receivedSoundEnabled: { type: Boolean, default: true },
  privateChatsEnabled: { type: Boolean, default: true },
  groupsEnabled: { type: Boolean, default: true },
  volume: { type: Number, default: 50, min: 0, max: 100 }
}, { timestamps: true });

module.exports = mongoose.models.UserNotificationSettings ||
  mongoose.model("UserNotificationSettings", userNotificationSettingsSchema);
