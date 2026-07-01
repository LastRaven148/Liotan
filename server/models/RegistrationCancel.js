const mongoose = require("mongoose");

const registrationCancelSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    username: { type: String, required: true, index: true },
    emailHash: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    expiresAt: { type: Date, required: true, index: true },
    usedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

registrationCancelSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports =
  mongoose.models.RegistrationCancel ||
  mongoose.model("RegistrationCancel", registrationCancelSchema);
