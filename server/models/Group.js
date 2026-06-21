const mongoose =
  require("mongoose");

const groupSchema =
  new mongoose.Schema(
    {
      name: {
        type: String,
        required: true,
        trim: true,
        minlength: 1,
        maxlength: 40
      },

      description: {
        type: String,
        default: "",
        trim: true,
        maxlength: 120
      },

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
        default: ""
      },

      owner: {
        type: String,
        required: true
      },

      admins: {
        type: [String],
        default: []
      },

      members: {
        type: [String],
        default: []
      }
    },
    {
      timestamps: true
    }
  );

module.exports =
  mongoose.model(
    "Group",
    groupSchema
  );