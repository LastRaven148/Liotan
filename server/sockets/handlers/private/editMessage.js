const Message = require("../../../models/Messages");
const logger = require("../../../utils/logger");
const { isValidMessage } = require("../../../utils/validators");
const emitToChatUsers = require("../../services/emitToChatUsers");
const { canEditMessage } = require("../../../utils/messagePermissions");
const {
  buildMessageContentPayload,
  normalizeEncryptedContent
} = require("../../services/encryptedContent");

function registerEditMessage({ io, socket }) {
  socket.on("editMessage", async (data) => {
    try {
      const sender = socket.user.username;
      const messageId = data.messageId;
      const encryptedContent = normalizeEncryptedContent(data.encryptedContent);
      const hasEncryptedContent = Boolean(encryptedContent);
      const hasPlainText = !hasEncryptedContent && isValidMessage(data.text);

      if (!messageId || (!hasEncryptedContent && !hasPlainText)) {
        return;
      }

      const msg = await Message.findById(messageId);

      if (!msg || !(await canEditMessage({ username: sender, message: msg }))) {
        return;
      }

      const contentPayload = buildMessageContentPayload({
        text: hasPlainText ? data.text.trim() : "",
        encryptedContent
      });

      msg.set(contentPayload);
      msg.edited = true;
      msg.editedAt = new Date();

      await msg.save();

      if (msg.chatType === "group") {
        io.to(`group:${msg.groupId}`).emit("messageEdited", msg);
        return;
      }

      emitToChatUsers({
        io,
        sender: msg.from,
        receiver: msg.to,
        event: "messageEdited",
        payload: msg
      });
    } catch (err) {
      logger.error("edit message failed", err);
    }
  });
}

module.exports = registerEditMessage;
