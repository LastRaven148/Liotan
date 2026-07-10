const mongoose =
  require("mongoose");

const e2eeKeySchema =
  new mongoose.Schema(
    {
      conversationId: {
        type: String,
        required: true,
        index: true
      },

      user: {
        type: String,
        required: true,
        index: true
      },

      sender: {
        type: String,
        required: true
      },

      commitId: {
        type: String,
        required: true,
        index: true
      },

      wrappedKey: {
        type: String,
        required: true
      },

      iv: {
        type: String,
        required: true
      },

      alg: {
        type: String,
        default: "ECDH-P256-AES-GCM"
      },

      version: {
        type: Number,
        default: 1
      }
    },
    {
      timestamps: true
    }
  );

e2eeKeySchema.index(
  {
    conversationId: 1,
    user: 1
  },
  {
    unique: true
  }
);

module.exports =
  mongoose.models.E2EEKey ||
  mongoose.model(
    "E2EEKey",
    e2eeKeySchema
  );
