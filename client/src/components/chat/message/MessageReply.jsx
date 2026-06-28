export default function MessageReply({
  message,
  t
}) {
  function getReplyPreview(replyTo) {
    if (!replyTo) {
      return "";
    }

    if (replyTo.text) {
      return replyTo.text;
    }

    if (replyTo.attachmentType === "photo") {
      return t.photo || "Фото";
    }

    if (replyTo.attachmentType === "video") {
      return "Видео";
    }

    if (replyTo.attachmentType === "audio") {
      return "Аудио";
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