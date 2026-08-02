"use strict";

const mongoose = require("mongoose");

const mediaTransferReservationSchema = new mongoose.Schema({
  reservationId: { type: String, required: true, unique: true },
  direction: { type: String, enum: ["upload", "download"], required: true },
  state: {
    type: String,
    enum: ["reserving", "reserved", "completed", "released"],
    default: "reserving",
    index: true
  },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  clientIdHash: { type: String, required: true },
  sessionIdHash: { type: String, required: true },
  ipHash: { type: String, required: true },
  conversationIdHash: { type: String, default: "" },
  uploadIdHash: { type: String, default: "" },
  declaredBytes: { type: Number, required: true, min: 1 },
  actualBytes: { type: Number, default: 0, min: 0 },
  scopes: [{
    key: { type: String, required: true },
    scope: { type: String, required: true },
    scopeIdHash: { type: String, required: true }
  }],
  bucketKeys: [{ type: String }],
  leaseOwner: { type: String, default: "", index: true },
  leaseExpiresAt: { type: Date, default: null, index: true },
  completedAt: { type: Date, default: null },
  releasedAt: { type: Date, default: null },
  expiresAt: { type: Date, required: true, index: true },
  purgeAt: { type: Date, default: null }
}, { timestamps: true });

mediaTransferReservationSchema.index({ state: 1, expiresAt: 1 });
mediaTransferReservationSchema.index({ purgeAt: 1 }, {
  expireAfterSeconds: 0,
  partialFilterExpression: { purgeAt: { $type: "date" } }
});

module.exports = mongoose.models.MediaTransferReservation ||
  mongoose.model("MediaTransferReservation", mediaTransferReservationSchema);
