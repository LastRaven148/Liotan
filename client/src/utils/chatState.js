export function addMessageToChat(
  prevChats,
  msg
) {

  const chatId =
    msg.chatId;

  const current =
    prevChats[chatId] || [];

  const exists =
    current.some(item =>
      String(item._id) === String(msg._id)
    );

  if (exists) {
    return prevChats;
  }

  return {
    ...prevChats,
    [chatId]: [
      ...current,
      msg
    ]
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
    readAt
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
    [chatId]: msgs || []
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