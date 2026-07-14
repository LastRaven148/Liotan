export const MAX_CHAT_WINDOW_MESSAGES = 240;

function messageTimestamp(message) {
  const parsed = Date.parse(message?.createdAt || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortMessages(messages) {
  return [...messages].sort((left, right) => {
    const leftSequence = Number(left?.mls?.sequence || 0);
    const rightSequence = Number(right?.mls?.sequence || 0);
    if (leftSequence && rightSequence && leftSequence !== rightSequence) return leftSequence - rightSequence;
    const timeDifference = messageTimestamp(left) - messageTimestamp(right);
    if (timeDifference) return timeDifference;
    return String(left?._id || "").localeCompare(String(right?._id || ""));
  });
}

function mergeMessages(current, incoming) {
  const byId = new Map(current.map(message => [String(message?._id || ""), message]));
  for (const message of incoming) {
    const id = String(message?._id || "");
    if (!id) continue;
    byId.set(id, byId.has(id) ? { ...byId.get(id), ...message } : message);
  }
  return sortMessages([...byId.values()]);
}

export function addMessageToChat(
  prevChats,
  msg
) {

  const chatId =
    msg.chatId;

  const current =
    prevChats[chatId] || [];

  const merged = mergeMessages(current, [msg]).slice(-MAX_CHAT_WINDOW_MESSAGES);

  return {
    ...prevChats,
    [chatId]: merged
  };

}

export function mergeHistoryPageIntoChat(prevChats, messages, direction = "initial") {
  if (!Array.isArray(messages) || !messages.length) return prevChats;
  const chatId = messages[0]?.chatId;
  if (!chatId) return prevChats;
  const merged = mergeMessages(prevChats[chatId] || [], messages);
  const windowed = direction === "older"
    ? merged.slice(0, MAX_CHAT_WINDOW_MESSAGES)
    : merged.slice(-MAX_CHAT_WINDOW_MESSAGES);
  return {
    ...prevChats,
    [chatId]: windowed
  };
}

export function editMessageInChat(
  prevChats,
  msg
) {

  const chatId =
    msg.chatId;

  return {
    ...prevChats,
    [chatId]:
      (prevChats[chatId] || []).map(item =>
        String(item._id) === String(msg._id)
          ? {
              ...item,
              ...msg
            }
          : item
      )
  };

}

export function deleteMessageFromChat(
  prevChats,
  {
    chatId,
    messageId
  }
) {

  return {
    ...prevChats,
    [chatId]:
      (prevChats[chatId] || []).filter(item =>
        String(item._id) !== String(messageId)
      )
  };

}

export function deleteChatFromState(
  prevChats,
  chatId
) {

  const next =
    {
      ...prevChats
    };

  delete next[chatId];

  return next;

}

export function updateMessagesStatus(
  prevChats,
  {
    chatId,
    messageIds,
    status,
    deliveredAt,
    readAt,
    progress,
    error
  }
) {

  const ids =
    new Set(
      (messageIds || []).map(String)
    );

  return {
    ...prevChats,

    [chatId]:
      (prevChats[chatId] || []).map(item => {

        if (!ids.has(String(item._id))) {
          return item;
        }

        return {
          ...item,
          status,
          progress:
            progress !== undefined
              ? progress
              : item.progress,
          error:
            error !== undefined
              ? error
              : item.error,
          deliveredAt:
            deliveredAt ||
            item.deliveredAt,
          readAt:
            readAt ||
            item.readAt
        };

      })
  };

}

export function pinMessageInChat(
  prevChats,
  msg
) {

  const chatId =
    msg.chatId;

  return {
    ...prevChats,

    [chatId]:
      (prevChats[chatId] || []).map(item =>
        String(item._id) === String(msg._id)
          ? {
              ...item,
              isPinned:
                Boolean(msg.isPinned),
              pinnedAt:
                msg.pinnedAt || null,
              pinnedBy:
                msg.pinnedBy || ""
            }
          : item
      )
  };

}

export function replaceChatHistory(
  prevChats,
  chatId,
  msgs
) {

  return {
    ...prevChats,
    [chatId]: sortMessages(msgs || []).slice(-MAX_CHAT_WINDOW_MESSAGES)
  };

}

export function incrementUnread(
  prevUnread,
  msg
) {

  const key =
    msg.chatType === "group"
      ? msg.chatId
      : msg.from;

  return {
    ...prevUnread,
    [key]:
      (prevUnread[key] || 0) + 1
  };

}
