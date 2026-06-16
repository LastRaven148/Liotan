export function addMessageToChat(
  prevChats,
  msg
) {

  const chatId =
    msg.chatId;

  return {
    ...prevChats,

    [chatId]: [
      ...(prevChats[chatId] || []),
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
      (prevChats[chatId] || []).map(
        item =>
          item._id === msg._id
            ? msg
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
      (prevChats[chatId] || []).filter(
        item =>
          item._id !== messageId
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
      (prevChats[chatId] || []).map(
        item => {

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

        }
      )
  };

}

export function incrementUnread(
  prevUnread,
  msg
) {

  return {
    ...prevUnread,

    [msg.from]:
      (prevUnread[msg.from] || 0) + 1
  };

}

export function replaceChatHistory(
  prevChats,
  chatId,
  msgs
) {

  return {
    ...prevChats,

    [chatId]: msgs
  };

}