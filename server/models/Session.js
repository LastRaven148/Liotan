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

      reauthenticatedAt: {
        type: Date,
        default: Date.now
      },

      expiresAt: {
        type: Date,
        required: true,
        index: true
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
  expiresAt: 1,
  lastSeenAt: -1
});

sessionSchema.index({
  expiresAt: 1,
  revokedAt: 1
});

sessionSchema.index({
  userId: 1,
  deviceKeyFingerprint: 1
});

sessionSchema.index({
  userId: 1,
  deviceIdHash: 1,
  revokedAt: 1,
  lastSeenAt: -1
});

module.exports =
  mongoose.models.Session ||
  mongoose.model(
    "Session",
    sessionSchema
  );
