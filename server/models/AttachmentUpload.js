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
      required: true,
      index: { expires: 0 }
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

module.exports = mongoose.model("AttachmentUpload", attachmentUploadSchema);
