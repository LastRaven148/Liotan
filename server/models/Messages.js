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

      // "plain" keeps backward compatibility for old messages.
      // "e2ee" is the target mode: server stores ciphertext only.
      contentMode: {
        type: String,
        enum: [
          "plain",
          "e2ee"
        ],
        default: "plain",
        index: true
      },

      text: {
        type: String,
        default: ""
      },

      encryptedContent: {
        ciphertext: {
          type: String,
          default: ""
        },
        iv: {
          type: String,
          default: ""
        },
        salt: {
          type: String,
          default: ""
        },
        kdf: {
          type: String,
          default: ""
        },
        iter: {
          type: Number,
          default: 0
        },
        kid: {
          type: String,
          default: ""
        },
        nonce: {
          type: String,
          default: "",
          index: true
        },
        alg: {
          type: String,
          default: ""
        },
        version: {
          type: Number,
          default: 1
        }
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
  waveform: {
    type: [Number],
    default: []
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
  chatId: 1,
  createdAt: -1
});

messageSchema.index({
  chatType: 1,
  groupId: 1,
  createdAt: -1
});

messageSchema.index({
  chatType: 1,
  from: 1,
  createdAt: -1
});

messageSchema.index({
  chatType: 1,
  to: 1,
  createdAt: -1
});

messageSchema.index({
  chatType: 1,
  to: 1,
  status: 1,
  createdAt: -1
});

messageSchema.index(
  {
    from: 1,
    "encryptedContent.nonce": 1
  },
  {
    unique: true,
    partialFilterExpression: {
      "encryptedContent.nonce": {
        $type: "string",
        $gt: ""
      }
    }
  }
);

module.exports =
  mongoose.model(
    "Message",
    messageSchema
  );