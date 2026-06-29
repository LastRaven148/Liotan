const mongoose =
  require("mongoose");

const sessionSchema =
  new mongoose.Schema(
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        index: true
      },

      username: {
        type: String,
        required: true,
        index: true
      },

      sessionIdHash: {
        type: String,
        required: true,
        unique: true,
        index: true
      },

      deviceIdHash: {
        type: String,
        default: "",
        index: true
      },

      deviceName: {
        type: String,
        default: "Unknown device",
        maxlength: 80
      },

      devicePublicKey: {
        type: mongoose.Schema.Types.Mixed,
        default: null
      },

      deviceKeyFingerprint: {
        type: String,
        default: "",
        maxlength: 80
      },

      transportMode: {
        type: String,
        enum: ["direct", "relay", "auto"],
        default: "auto"
      },

      userAgentHash: {
        type: String,
        default: ""
      },

      createdAt: {
        type: Date,
        default: Date.now
      },

      lastSeenAt: {
        type: Date,
        default: Date.now
      },

      revokedAt: {
        type: Date,
        default: null
      }
    },
    {
      timestamps: true
    }
  );

sessionSchema.index({
  userId: 1,
  revokedAt: 1,
  lastSeenAt: -1
});

sessionSchema.index({
  userId: 1,
  deviceKeyFingerprint: 1
});

module.exports =
  mongoose.models.Session ||
  mongoose.model(
    "Session",
    sessionSchema
  );
