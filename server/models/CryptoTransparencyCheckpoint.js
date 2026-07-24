"use strict";

const mongoose = require("mongoose");

const cryptoTransparencyCheckpointSchema = new mongoose.Schema({
  treeSize: { type: Number, required: true, unique: true, min: 1 },
  rootHash: { type: String, required: true },
  checkpoint: { type: mongoose.Schema.Types.Mixed, required: true },
  signature: { type: String, required: true },
  checkpointHash: { type: String, required: true },
  signingKeyId: { type: String, required: true, index: true },
  signingPublicKey: { type: String, required: true }
}, { timestamps: true });

module.exports = mongoose.models.CryptoTransparencyCheckpoint ||
  mongoose.model("CryptoTransparencyCheckpoint", cryptoTransparencyCheckpointSchema);
