import { useEffect, useRef } from "react";
import io from "socket.io-client";

import {
  addMessageToChat,
  editMessageInChat,
  deleteMessageFromChat,
  deleteChatFromState,
  incrementUnread,
  replaceChatHistory,
  updateMessagesStatus
} from "../utils/chatState";

import {
  SOCKET_EVENTS
} from "../constants/socketEvents";

function statusRank(status) {

  if (status === "read") {
    return 3;
  }

  if (status === "delivered") {
    return 2;
  }

  return 1;

}

function getMessageChatKey(
  msg,
  username
) {

  if (msg.chatType === "group") {
    return (
      msg.chatId ||
      `group:${msg.groupId}`
    );
  }

  return msg.from === username
    ? msg.to
    : msg.from;

}

function mergeChatHistory(
  prevChats,
  chatId,
  msgs
) {

  const current =
    prevChats[chatId] || [];

  const currentMap =
    new Map(
      current.map(msg => [
        String(msg._id),
        msg
      ])
    );

  const merged =
    msgs.map(msg => {

      const existing =
        currentMap.get(
          String(msg._id)
        );

      if (
        !existing ||
        statusRank(msg.status) >=
        statusRank(existing.status)
      ) {
        return msg;
      }

      return {
        ...msg,
        status: existing.status,
        deliveredAt:
          existing.deliveredAt ||
          msg.deliveredAt,
        readAt:
          existing.readAt ||
          msg.readAt
      };

    });

  return replaceChatHistory(
    prevChats,
    chatId,
    merged
  );

}

export default function useSocket({
  token,
  username,
  activeChat,
  setActiveChat,
  setChats,
  setUnread,
  setOnlineUsers,
  setTypingUsers,
  updateDialog,
  updateUserLastSeen,
  removeDialog,
  socketRef,
  API
}) {

  const activeChatRef =
    useRef(null);

  useEffect(() => {

    activeChatRef.current =
      activeChat;

  }, [activeChat]);

  useEffect(() => {

    if (!token) {
      return;
    }

    const socket =
      io(API, {
        auth: {
          token
        }
      });

    socketRef.current =
      socket;

    socket.on(
      "connect_error",
      err => {
        console.log(
          "SOCKET ERROR",
          err.message
        );
      }
    );

    function markActiveChatRead(
      user
    ) {

      if (
        !user ||
        user === username ||
        user.startsWith?.("group:")
      ) {
        return;
      }

      socket.emit(
        SOCKET_EVENTS.MARK_CHAT_READ,
        {
          user2: user
        }
      );

    }

    function handleNewMessage(
      msg
    ) {

      const chatKey =
        getMessageChatKey(
          msg,
          username
        );

      setChats(prev =>
        addMessageToChat(
          prev,
          msg
        )
      );

      if (
        msg.from !== username &&
        activeChatRef.current !== chatKey
      ) {

        setUnread(prev => ({
          ...prev,
          [chatKey]:
            (prev[chatKey] || 0) + 1
        }));

      }

      if (
        msg.from !== username &&
        activeChatRef.current === chatKey
      ) {

        markActiveChatRead(
          chatKey
        );

        setUnread(prev => ({
          ...prev,
          [chatKey]: 0
        }));

      }

      setTypingUsers(prev => ({
        ...prev,
        [msg.from]: false
      }));

      updateDialog(
        msg,
        username
      );

    }

    function handleMessageEdited(
      msg
    ) {

      setChats(prev =>
        editMessageInChat(
          prev,
          msg
        )
      );

      updateDialog(
        msg,
        username
      );

    }

    function handleMessageDeleted(
      data
    ) {

      setChats(prev =>
        deleteMessageFromChat(
          prev,
          data
        )
      );

      const deleted =
        data.deletedMessage;

      if (!deleted) {
        return;
      }

      const chatKey =
        deleted.chatType === "group"
          ? (
              deleted.chatId ||
              `group:${deleted.groupId}`
            )
          : deleted.from === username
            ? deleted.to
            : deleted.from;

      if (deleted.from !== username) {

        setUnread(prev => {

          const nextCount =
            Math.max(
              0,
              (prev[chatKey] || 0) - 1
            );

          return {
            ...prev,
            [chatKey]: nextCount
          };

        });

      }

      if (data.latestMessage) {

        updateDialog(
          data.latestMessage,
          username
        );

      } else {

        removeDialog(
          chatKey
        );

      }

    }

    function handleChatDeleted({
      chatId,
      user1,
      user2
    }) {

      const dialogUsername =
        user1 === username
          ? user2
          : user1;

      setChats(prev =>
        deleteChatFromState(
          prev,
          chatId
        )
      );

      setUnread(prev => ({
        ...prev,
        [dialogUsername]: 0
      }));

      setTypingUsers(prev => ({
        ...prev,
        [dialogUsername]: false
      }));

      removeDialog(
        dialogUsername
      );

      if (
        activeChatRef.current ===
        dialogUsername
      ) {
        setActiveChat(null);
      }

    }

    function handleChatHistory({
      chatId,
      msgs
    }) {

      setChats(prev =>
        mergeChatHistory(
          prev,
          chatId,
          msgs
        )
      );

      markActiveChatRead(
        activeChatRef.current
      );

    }

    function handleMessageDelivered(
      data
    ) {

      setChats(prev =>
        updateMessagesStatus(
          prev,
          {
            ...data,
            status: "delivered"
          }
        )
      );

    }

    function handleMessageRead(
      data
    ) {

      setChats(prev =>
        updateMessagesStatus(
          prev,
          {
            ...data,
            status: "read"
          }
        )
      );

    }

    function handleUserTyping({
      from
    }) {

      if (!from || from === username) {
        return;
      }

      setTypingUsers(prev => ({
        ...prev,
        [from]: true
      }));

    }

    function handleUserStoppedTyping({
      from
    }) {

      if (!from) {
        return;
      }

      setTypingUsers(prev => ({
        ...prev,
        [from]: false
      }));

    }

    function handleOnlineUsers(
      users
    ) {

      setOnlineUsers(users);

    }

    function handleUserLastSeen({
      username: targetUsername,
      lastSeen
    }) {

      if (
        !targetUsername ||
        targetUsername === username
      ) {
        return;
      }

      updateUserLastSeen(
        targetUsername,
        lastSeen
      );

    }

    socket.on(
      SOCKET_EVENTS.NEW_MESSAGE,
      handleNewMessage
    );

    socket.on(
      SOCKET_EVENTS.MESSAGE_EDITED,
      handleMessageEdited
    );

    socket.on(
      SOCKET_EVENTS.MESSAGE_DELETED,
      handleMessageDeleted
    );

    socket.on(
      SOCKET_EVENTS.CHAT_DELETED,
      handleChatDeleted
    );

    socket.on(
      SOCKET_EVENTS.MESSAGE_DELIVERED,
      handleMessageDelivered
    );

    socket.on(
      SOCKET_EVENTS.MESSAGE_READ,
      handleMessageRead
    );

    socket.on(
      SOCKET_EVENTS.USER_TYPING,
      handleUserTyping
    );

    socket.on(
      SOCKET_EVENTS.USER_STOPPED_TYPING,
      handleUserStoppedTyping
    );

    socket.on(
      SOCKET_EVENTS.CHAT_HISTORY,
      handleChatHistory
    );

    socket.on(
      SOCKET_EVENTS.ONLINE_USERS,
      handleOnlineUsers
    );

    socket.on(
      SOCKET_EVENTS.USER_LAST_SEEN,
      handleUserLastSeen
    );

    return () => {

      socket.off(
        SOCKET_EVENTS.NEW_MESSAGE,
        handleNewMessage
      );

      socket.off(
        SOCKET_EVENTS.MESSAGE_EDITED,
        handleMessageEdited
      );

      socket.off(
        SOCKET_EVENTS.MESSAGE_DELETED,
        handleMessageDeleted
      );

      socket.off(
        SOCKET_EVENTS.CHAT_DELETED,
        handleChatDeleted
      );

      socket.off(
        SOCKET_EVENTS.MESSAGE_DELIVERED,
        handleMessageDelivered
      );

      socket.off(
        SOCKET_EVENTS.MESSAGE_READ,
        handleMessageRead
      );

      socket.off(
        SOCKET_EVENTS.USER_TYPING,
        handleUserTyping
      );

      socket.off(
        SOCKET_EVENTS.USER_STOPPED_TYPING,
        handleUserStoppedTyping
      );

      socket.off(
        SOCKET_EVENTS.CHAT_HISTORY,
        handleChatHistory
      );

      socket.off(
        SOCKET_EVENTS.ONLINE_USERS,
        handleOnlineUsers
      );

      socket.off(
        SOCKET_EVENTS.USER_LAST_SEEN,
        handleUserLastSeen
      );

      socket.disconnect();

    };

  }, [
    token,
    username,
    API,
    setActiveChat,
    setChats,
    setUnread,
    setOnlineUsers,
    setTypingUsers,
    updateDialog,
    updateUserLastSeen,
    removeDialog,
    socketRef
  ]);

}