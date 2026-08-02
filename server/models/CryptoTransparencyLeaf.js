"use strict";

const mongoose = require("mongoose");

const cryptoTransparencyLeafSchema = new mongoose.Schema({
  sequence: { type: Number, required: true, unique: true, min: 1 },
  cryptoUserId: { type: String, required: true, index: true },
  directoryVersion: { type: Number, required: true, min: 1 },
  directoryHash: { type: String, required: true },
  leaf: { type: mongoose.Schema.Types.Mixed, required: true },
  leafHash: { type: String, required: true }
}, { timestamps: true });

cryptoTransparencyLeafSchema.index(
  { cryptoUserId: 1, directoryVersion: 1 },
  { unique: true }
);

module.exports = mongoose.models.CryptoTransparencyLeaf ||
  mongoose.model("CryptoTransparencyLeaf", cryptoTransparencyLeafSchema);
