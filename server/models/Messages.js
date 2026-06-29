const mongoose =
  require("mongoose");

const messageSchema =
  new mongoose.Schema(
    {
      chatType: {
        type: String,
        enum: [
          "private",
          "group"
        ],
        default: "private"
      },

      groupId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Group",
        default: null
      },

      chatId: {
        type: String,
        default: ""
      },

      from: {
        type: String,
        required: true
      },

      to: {
        type: String,
        default: ""
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

      deliveredTo: {
        type: [String],
        default: []
      },

      readBy: {
        type: [String],
        default: []
      },

      deletedFor: {
        type: [String],
        default: []
      },

      edited: {
        type: Boolean,
        default: false
      },

      editedAt: {
        type: Date,
        default: null
      },

      isPinned: {
        type: Boolean,
        default: false
      },

      pinnedAt: {
        type: Date,
        default: null
      },

      pinnedBy: {
        type: String,
        default: ""
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
      "video",
      "audio",
      "voice",
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
    default: ""
  },
  resourceType: {
    type: String,
    default: "auto"
  },
  e2eeMedia: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  }
}
    },
    {
      timestamps: true
    }
  );

messageSchema.index({
  chatType: 1,
  chatId: 1
});

messageSchema.index({
  chatType: 1,
  groupId: 1
});

module.exports =
  mongoose.model(
    "Message",
    messageSchema
  );