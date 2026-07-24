"use strict";

const mongoose = require("mongoose");

const cryptoTransparencyStateSchema = new mongoose.Schema({
  _id: { type: String, default: "global-v1" },
  treeSize: { type: Number, default: 0, min: 0 },
  rootHash: { type: String, default: "" },
  frontier: { type: [String], default: [] },
  checkpointHash: { type: String, default: "" },
  signingKeyId: { type: String, default: "" },
  signingPublicKey: { type: String, default: "" }
}, { timestamps: true });

module.exports = mongoose.models.CryptoTransparencyState ||
  mongoose.model("CryptoTransparencyState", cryptoTransparencyStateSchema);
