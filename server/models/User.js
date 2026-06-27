const mongoose =
  require("mongoose");

module.exports =
  mongoose.model(
    "User",
    new mongoose.Schema({
      username: {
        type: String,
        unique: true
      },

      displayName: {
        type: String,
        default: ""
      },

      password: String,

      avatar: {
        type: String,
        default: ""
      },

      avatarPublicId: {
        type: String,
        default: ""
      },

      avatarResourceType: {
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
    })
  );