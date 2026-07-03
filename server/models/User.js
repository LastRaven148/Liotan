const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  username: {
    type: String
  },

  displayName: {
    type: String,
    default: ""
  },

  password: String,

  emailHash: {
    type: String
  },

  emailVerified: {
    type: Boolean,
    default: false
  },

  e2eePublicKey: {
    type: Object,
    default: null
  },

  e2eeIdentityBackup: {
    type: Object,
    default: null
  },

  avatar: {
    type: String,
    default: ""
  },

  avatarStorageKey: {
    type: String,
    default: ""
  },

  avatarStorageType: {
    type: String,
    default: "image"
  },

  bio: {
    type: String,
    default: ""
  },

  pinnedChats: {
    type: [String],
    default: []
  },

  archivedChats: {
    type: [String],
    default: []
  },

  lastSeen: {
    type: Date,
    default: Date.now
  }
});

userSchema.index({ username: 1 }, { unique: true });
userSchema.index({ emailHash: 1 }, { unique: true, sparse: true });

module.exports =
  mongoose.models.User ||
  mongoose.model("User", userSchema);