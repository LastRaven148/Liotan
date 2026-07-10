const mongoose = require("mongoose");

const e2eeConversationSchema = new mongoose.Schema({
  conversationId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  commitId: {
    type: String,
    required: true
  },
  participants: {
    type: [String],
    required: true
  },
  createdBy: {
    type: String,
    required: true
  }
}, { timestamps: true });

module.exports = mongoose.models.E2EEConversation ||
  mongoose.model("E2EEConversation", e2eeConversationSchema);
