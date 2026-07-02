const mongoose = require("mongoose");

const registrationCancelSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    username: { type: String, required: true, index: true },
    emailHash: { type: String, required: true, index: true },
    emailEnvelope: { type: mongoose.Schema.Types.Mixed, default: null },
    tokenHash: { type: String, required: true, unique: true },
    sessionIdHash: { type: String, default: "", index: true },
    deviceName: { type: String, default: "Unknown device", maxlength: 120 },
    browserName: { type: String, default: "Unknown browser", maxlength: 80 },
    osName: { type: String, default: "Unknown OS", maxlength: 80 },
    ipHint: { type: String, default: "", maxlength: 80 },
    createdIpHash: { type: String, default: "", index: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    actionTaken: { type: String, default: "", maxlength: 40 },
    actionTakenAt: { type: Date, default: null }
  },
  { timestamps: true }
);

registrationCancelSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports =
  mongoose.models.RegistrationCancel ||
  mongoose.model("RegistrationCancel", registrationCancelSchema);
