const Message = require("../../../models/Messages");
const logger = require("../../../utils/logger");
const { isValidMessage } = require("../../../utils/validators");
const emitToChatUsers = require("../../services/emitToChatUsers");
const { canEditMessage } = require("../../../utils/messagePermissions");

function isValidEncryptedContent(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof value.ciphertext === "string" &&
    value.ciphertext.length > 0 &&
    value.ciphertext.length <= 100000 &&
    typeof value.iv === "string" &&
    value.iv.length > 0 &&
    value.iv.length <= 500 &&
    typeof value.alg === "string" &&
    value.alg.length > 0 &&
    value.alg.length <= 100
  );
}

function normalizeEncryptedContent(value) {
  if (!isValidEncryptedContent(value)) {
    return null;
  }

  return {
    ciphertext: value.ciphertext,
    iv: value.iv,
    alg: value.alg,
    version: Number.isFinite(Number(value.version))
      ? Math.max(1, Math.floor(Number(value.version)))
      : 1
  };
}

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

      if (hasEncryptedContent) {
        msg.contentMode = "e2ee";
        msg.encryptedContent = encryptedContent;
        msg.text = "";
      } else {
        msg.contentMode = "plain";
        msg.encryptedContent = undefined;
        msg.text = data.text.trim();
      }

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
