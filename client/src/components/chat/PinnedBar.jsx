import { isEncryptedText } from "../../utils/e2ee";
function getMessagePreview(
  message,
  t
) {

  if (!message) {
    return "";
  }

  if (message.text && !isEncryptedText(message.text)) {
    return message.text;
  }

  if (message.attachment?.type === "photo") {
    return t.photo || "Фото";
  }

  if (message.attachment?.type === "voice") {
    return "Голосовое сообщение";
  }

  if (message.attachment?.type === "audio") {
    return "Аудио";
  }

  if (message.attachment?.type === "video") {
    return "Видео";
  }

  if (message.attachment?.type === "file") {
    return message.attachment.name || t.file || "Файл";
  }

  return t.message || "Сообщение";

}

export default function PinnedBar({
  message,
  t,
  onClick
}) {

  if (!message) {
    return null;
  }

  return (
    <div className="pinned-bar-wrap">
      <button
        type="button"
        className="pinned-bar"
        onClick={onClick}
      >
        <div className="pinned-bar-line" />

        <div className="pinned-bar-content">
          <div className="pinned-bar-title">
            Закреплённое сообщение
          </div>

          <div className="pinned-bar-text">
            {getMessagePreview(
              message,
              t
            )}
          </div>
        </div>
      </button>
    </div>
  );

}