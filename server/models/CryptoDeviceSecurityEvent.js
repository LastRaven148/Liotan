"use strict";

const mongoose = require("mongoose");

const cryptoDeviceSecurityEventSchema = new mongoose.Schema({
  eventId: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  cryptoUserId: { type: String, required: true, index: true },
  type: {
    type: String,
    enum: ["recovery-enrollment"],
    required: true,
    index: true
  },
  targetDeviceId: { type: String, required: true },
  targetClientId: { type: String, required: true },
  priorActiveDeviceCount: { type: Number, required: true, min: 0 },
  statement: { type: mongoose.Schema.Types.Mixed, required: true },
  statementSignature: { type: String, required: true }
}, { timestamps: true });

cryptoDeviceSecurityEventSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.models.CryptoDeviceSecurityEvent ||
  mongoose.model("CryptoDeviceSecurityEvent", cryptoDeviceSecurityEventSchema);
