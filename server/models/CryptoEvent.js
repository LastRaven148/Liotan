const mongoose = require("mongoose");

const cryptoEventSchema = new mongoose.Schema({
  conversationId: { type: String, required: true, index: true },
  sequence: { type: Number, required: true },
  kind: { type: String, enum: ["commit", "welcome", "message"], required: true, index: true },
  senderUserId: { type: mongoose.Schema.Types.ObjectId, required: true },
  senderUsername: { type: String, required: true },
  senderClientId: { type: String, required: true },
  clientMessageId: { type: String, default: "", index: true },
  ciphertext: { type: String, default: "" },
  commit: { type: String, default: "" },
  welcome: { type: String, default: "" },
  groupInfo: { type: mongoose.Schema.Types.Mixed, default: null },
  recipients: [{ type: String }],
  epoch: { type: Number, required: true },
  byteLength: { type: Number, required: true }
}, { timestamps: true });

cryptoEventSchema.index({ conversationId: 1, sequence: 1 }, { unique: true });
cryptoEventSchema.index({ conversationId: 1, clientMessageId: 1 }, {
  unique: true,
  partialFilterExpression: { clientMessageId: { $type: "string", $gt: "" } }
});

module.exports = mongoose.models.CryptoEvent || mongoose.model("CryptoEvent", cryptoEventSchema);
