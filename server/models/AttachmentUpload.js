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
      required: true
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
    publicId: {
      type: String,
      required: true
    },
    resourceType: {
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

module.exports = mongoose.model("AttachmentUpload", attachmentUploadSchema);
