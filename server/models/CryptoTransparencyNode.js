"use strict";

const mongoose = require("mongoose");

const cryptoTransparencyNodeSchema = new mongoose.Schema({
  level: { type: Number, required: true, min: 1 },
  index: { type: Number, required: true, min: 0 },
  hash: { type: String, required: true }
}, { timestamps: true });

cryptoTransparencyNodeSchema.index({ level: 1, index: 1 }, { unique: true });

module.exports = mongoose.models.CryptoTransparencyNode ||
  mongoose.model("CryptoTransparencyNode", cryptoTransparencyNodeSchema);
