const mongoose =
  require("mongoose");

const messageSchema =
  new mongoose.Schema(
    {
      chatId: {
        type: String,
        required: true
      },

      from: {
        type: String,
        required: true
      },

      to: {
        type: String,
        required: true
      },

      text: {
        type: String,
        default: ""
      },

      replyTo: {
        messageId: {
          type: String,
          default: ""
        },
        from: {
          type: String,
          default: ""
        },
        text: {
          type: String,
          default: ""
        },
        attachmentType: {
          type: String,
          default: ""
        },
        attachmentName: {
          type: String,
          default: ""
        }
      },

      status: {
        type: String,
        enum: [
          "sent",
          "delivered",
          "read"
        ],
        default: "sent"
      },

      deliveredAt: {
        type: Date,
        default: null
      },

      readAt: {
        type: Date,
        default: null
      },

      edited: {
        type: Boolean,
        default: false
      },

      editedAt: {
        type: Date,
        default: null
      },

      attachment: {
        url: {
          type: String,
          default: ""
        },
        name: {
          type: String,
          default: ""
        },
        type: {
          type: String,
          enum: [
            "",
            "photo",
            "file"
          ],
          default: ""
        },
        mimeType: {
          type: String,
          default: ""
        },
        size: {
          type: Number,
          default: 0
        }
      }
    },
    {
      timestamps: true
    }
  );

module.exports =
  mongoose.model(
    "Message",
    messageSchema
  );