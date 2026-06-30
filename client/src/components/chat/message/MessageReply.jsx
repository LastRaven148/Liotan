import {
  useEffect,
  useState
} from "react";

import {
  decryptTextForChat,
  isEncryptedText
} from "../../../utils/e2ee";

function cleanReplyPreview(value) {
  if (!value) {
    return "";
  }

  if (isEncryptedText(value)) {
    return "";
  }

  return value;
}

export default function MessageReply({
  message,
  t,
  username,
  activeChat,
  e2eeRevision = 0
}) {
  const [replyText, setReplyText] =
    useState(cleanReplyPreview(message.replyTo?.text || ""));

  useEffect(() => {
    let cancelled = false;

    async function updateReplyText() {
      const text = message.replyTo?.text || "";

      if (!isEncryptedText(text)) {
        setReplyText(cleanReplyPreview(text));
        return;
      }

      const value = await decryptTextForChat({
        username,
        chatKey: activeChat,
        text
      });

      if (!cancelled) {
        setReplyText(cleanReplyPreview(value));
      }
    }

    updateReplyText();

    return () => {
      cancelled = true;
    };
  }, [
    message.replyTo?.text,
    username,
    activeChat,
    e2eeRevision
  ]);

  function getReplyPreview(replyTo) {
    if (!replyTo) {
      return "";
    }

    if (replyText) {
      return replyText;
    }

    if (replyTo.attachmentType === "photo") {
      return t.photo || "Фото";
    }

    if (replyTo.attachmentType === "video") {
      return t.video || "Видео";
    }

    if (replyTo.attachmentType === "voice") {
      return t.voiceMessage || "Голосовое сообщение";
    }

    if (replyTo.attachmentType === "audio") {
      return t.audio || "Аудио";
    }

    if (replyTo.attachmentType === "file") {
      return replyTo.attachmentName || t.file || "Файл";
    }

    return t.message || "Сообщение";
  }

  function scrollToReplyMessage(e) {
    e.preventDefault();
    e.stopPropagation();

    const targetId =
      message.replyTo?.messageId;

    if (!targetId) {
      return;
    }

    const target =
      document.querySelector(
        `[data-message-id="${targetId}"]`
      );

    if (!target) {
      return;
    }

    target.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });

    target.classList.add("message-highlight");

    setTimeout(() => {
      target.classList.remove("message-highlight");
    }, 1200);
  }

  if (!message.replyTo?.messageId) {
    return null;
  }

  return (
    <button
      type="button"
      className="message-reply"
      onClick={scrollToReplyMessage}
    >
      <div className="message-reply-author">
        {message.replyTo.from}
      </div>

      <div className="message-reply-text">
        {getReplyPreview(message.replyTo)}
      </div>
    </button>
  );
}
