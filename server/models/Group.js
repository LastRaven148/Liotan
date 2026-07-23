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

      avatarStorageKey: {
        type: String,
        default: ""
      },

      avatarStorageType: {
        type: String,
        default: ""
      },

      avatarVersion: {
        type: Number,
        default: 0,
        min: 0
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
      },

      e2eeVersion: {
        type: Number,
        default: 1,
        min: 1
      },

      lifecycleState: {
        type: String,
        enum: ["active", "deleting"],
        default: "active",
        index: true
      },

      deletionWorkflowId: {
        type: String,
        default: "",
        index: true
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
