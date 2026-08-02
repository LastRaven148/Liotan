"use strict";

const mongoose = require("mongoose");

const cryptoDeviceRebindChallengeSchema = new mongoose.Schema({
  challengeId: { type: String, required: true, unique: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  cryptoUserId: { type: String, required: true, index: true },
  deviceId: { type: String, required: true, index: true },
  clientId: { type: String, required: true },
  oldSessionBindingId: { type: String, required: true },
  newSessionBindingId: { type: String, required: true },
  newSessionIdHash: { type: String, required: true },
  statement: { type: mongoose.Schema.Types.Mixed, required: true },
  expiresAt: { type: Date, required: true, index: true },
  consumedAt: { type: Date, default: null },
  purgeAt: { type: Date, required: true }
}, { timestamps: true });

cryptoDeviceRebindChallengeSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });
cryptoDeviceRebindChallengeSchema.index({ userId: 1, deviceId: 1, createdAt: -1 });

module.exports = mongoose.models.CryptoDeviceRebindChallenge ||
  mongoose.model("CryptoDeviceRebindChallenge", cryptoDeviceRebindChallengeSchema);
