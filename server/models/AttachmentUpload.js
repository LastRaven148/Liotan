const mongoose = require("mongoose");

const attachmentUploadSchema = new mongoose.Schema(
  {
    uploadId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    owner: {
      type: String,
      required: true,
      index: true
    },
    url: {
      type: String,
      default: ""
    },
    mediaUrl: {
      type: String,
      default: ""
    },
    name: {
      type: String,
      default: "file"
    },
    type: {
      type: String,
      enum: ["photo", "video", "audio", "voice", "file"],
      default: "file"
    },
    mimeType: {
      type: String,
      default: "application/octet-stream"
    },
    size: {
      type: Number,
      default: 0
    },
    encrypted: {
      type: Boolean,
      default: false,
      index: true
    },
    protocol: {
      type: String,
      enum: ["legacy-v3", "mls-media-1"],
      default: "legacy-v3",
      index: true
    },
    cryptoConversationId: {
      type: String,
      default: "",
      index: true
    },
    cryptoClientId: {
      type: String,
      default: "",
      index: true
    },
    bindingId: {
      type: String,
      default: "",
      index: true
    },
    ciphertextHash: {
      type: String,
      default: ""
    },
    boundClientMessageId: {
      type: String,
      default: "",
      index: true
    },
    commitTokenHash: {
      type: String,
      default: ""
    },
    deleteTokenHash: {
      type: String,
      default: ""
    },
    lifecycleState: {
      type: String,
      enum: ["temporary", "committed", "deletion-pending"],
      default: "temporary",
      index: true
    },
    committedEventSequence: {
      type: Number,
      default: 0
    },
    committedAt: {
      type: Date,
      default: null
    },
    cleanupAttempts: {
      type: Number,
      default: 0
    },
    cleanupLastErrorAt: {
      type: Date,
      default: null
    },
    width: {
      type: Number,
      default: 0
    },
    height: {
      type: Number,
      default: 0
    },
    duration: {
      type: Number,
      default: 0
    },
    storageKey: {
      type: String,
      required: true
    },
    storageType: {
      type: String,
      default: "auto"
    },
    usedAt: {
      type: Date,
      default: null,
      index: true
    },
    expiresAt: {
      type: Date,
      default: null,
      index: true
    }
  },
  {
    timestamps: true
  }
);

attachmentUploadSchema.index(
  { cryptoConversationId: 1, bindingId: 1 },
  { unique: true, partialFilterExpression: { protocol: "mls-media-1" } }
);
attachmentUploadSchema.index({ lifecycleState: 1, expiresAt: 1 });

module.exports = mongoose.model("AttachmentUpload", attachmentUploadSchema);
