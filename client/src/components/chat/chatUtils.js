import { isEncryptedText } from "../../utils/e2ee";
function isSameDay(a, b) {

  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );

}

function getDateLabel(
  value,
  t
) {

  const date =
    new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const now =
    new Date();

  const yesterday =
    new Date();

  yesterday.setDate(
    yesterday.getDate() - 1
  );

  if (isSameDay(date, now)) {
    return t.today;
  }

  if (isSameDay(date, yesterday)) {
    return t.yesterday;
  }

  return date.toLocaleDateString(
    [],
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }
  );

}

export function buildMessagesWithDates(
  messages,
  t
) {

  const result = [];
  let lastDateKey = "";

  for (const message of messages) {

    const date =
      new Date(message.createdAt);

    if (Number.isNaN(date.getTime())) {
      result.push({
        type: "message",
        message
      });

      continue;
    }

    const dateKey =
      `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

    if (dateKey !== lastDateKey) {
      result.push({
        type: "date",
        id: `date-${dateKey}`,
        label:
          getDateLabel(
            message.createdAt,
            t
          )
      });

      lastDateKey =
        dateKey;
    }

    result.push({
      type: "message",
      message
    });

  }

  return result;

}

export function getMessagePreview(
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

  if (message.attachment?.type === "video") {
    return "Видео";
  }

  if (message.attachment?.type === "voice") {
    return "Голосовое сообщение";
  }

  if (message.attachment?.type === "audio") {
    return "Аудио";
  }

  if (message.attachment?.type === "file") {
    return message.attachment.name || t.file || "Файл";
  }

  return t.message || "Сообщение";

}