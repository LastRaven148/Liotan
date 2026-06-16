import {
  useState,
  useMemo,
  useRef
} from "react";

import { getChatId } from "../utils/chat";
import { SOCKET_EVENTS } from "../constants/socketEvents";

import {
  uploadAttachmentApi
} from "../services/api";

export default function useChat({
  username,
  socketRef,
  setUnread,
  chats,
  dialogs
}) {

  const [activeChat, setActiveChat] =
    useState(null);

  const [text, setTextState] =
    useState("");

  const [
    editingMessage,
    setEditingMessage
  ] = useState(null);

  const [
    replyMessage,
    setReplyMessage
  ] = useState(null);

  const typingTimerRef =
    useRef(null);

  const typingChatRef =
    useRef(null);

  function stopTyping(
    user = activeChat
  ) {

    if (
      !socketRef.current ||
      !user ||
      user === username
    ) {
      return;
    }

    socketRef.current.emit(
      SOCKET_EVENTS.STOP_TYPING,
      {
        to: user
      }
    );

    typingChatRef.current =
      null;

    if (typingTimerRef.current) {
      clearTimeout(
        typingTimerRef.current
      );

      typingTimerRef.current =
        null;
    }

  }

  function startTyping(
    user
  ) {

    if (
      !socketRef.current ||
      !user ||
      user === username
    ) {
      return;
    }

    if (typingChatRef.current !== user) {
      socketRef.current.emit(
        SOCKET_EVENTS.TYPING,
        {
          to: user
        }
      );

      typingChatRef.current =
        user;
    }

    if (typingTimerRef.current) {
      clearTimeout(
        typingTimerRef.current
      );
    }

    typingTimerRef.current =
      setTimeout(
        () => {
          stopTyping(user);
        },
        1200
      );

  }

  function setText(value) {

    setTextState(value);

    if (
      value.trim().length > 0
    ) {
      startTyping(activeChat);
      return;
    }

    stopTyping(activeChat);

  }

  function openChat(user) {

    if (activeChat === user) {
      return;
    }

    stopTyping(activeChat);

    setActiveChat(user);
    setEditingMessage(null);
    setReplyMessage(null);
    setTextState("");

    setUnread(prev => ({
      ...prev,
      [user]: 0
    }));

    const socket =
      socketRef.current;

    if (!socket) {
      return;
    }

    const chatId =
      getChatId(
        username,
        user
      );

    socket.emit(
      SOCKET_EVENTS.JOIN_CHAT,
      chatId
    );

    socket.emit(
      SOCKET_EVENTS.GET_CHAT,
      {
        user2: user
      }
    );

  }

  function sendMessage(
    attachment = null
  ) {

    if (
      !socketRef.current ||
      !activeChat
    ) {
      return;
    }

    const hasText =
      text.trim().length > 0;

    const hasAttachment =
      Boolean(attachment);

    if (
      editingMessage &&
      hasText
    ) {

      socketRef.current.emit(
        SOCKET_EVENTS.EDIT_MESSAGE,
        {
          messageId:
            editingMessage._id,
          text
        }
      );

      stopTyping(activeChat);

      setEditingMessage(null);
      setReplyMessage(null);
      setTextState("");

      return;
    }

    if (
      !hasText &&
      !hasAttachment
    ) {
      return;
    }

    socketRef.current.emit(
      SOCKET_EVENTS.SEND_MESSAGE,
      {
        to: activeChat,
        text:
          hasText
            ? text
            : "",
        attachment,
        replyTo:
          replyMessage
            ? {
                messageId:
                  replyMessage._id
              }
            : null
      }
    );

    stopTyping(activeChat);

    setReplyMessage(null);
    setTextState("");

  }

  function deleteChat(user = activeChat) {

    if (
      !socketRef.current ||
      !user
    ) {
      return;
    }

    stopTyping(user);

    socketRef.current.emit(
      SOCKET_EVENTS.DELETE_CHAT,
      {
        user2: user
      }
    );

  }

  async function sendAttachment(file) {

    if (
      !file ||
      !socketRef.current ||
      !activeChat
    ) {
      return;
    }

    try {

      const attachment =
        await uploadAttachmentApi(
          file
        );

      sendMessage(
        attachment
      );

    } catch (err) {
      console.error(err);
    }

  }

  function startEditMessage(
    message
  ) {

    if (
      !message ||
      message.from !== username
    ) {
      return;
    }

    stopTyping(activeChat);

    setReplyMessage(null);
    setEditingMessage(message);
    setTextState(message.text || "");

  }

  function startReplyMessage(
    message
  ) {

    if (!message) {
      return;
    }

    setEditingMessage(null);
    setReplyMessage(message);

  }

  function cancelReplyMessage() {

    setReplyMessage(null);

  }

  function cancelEditMessage() {

    stopTyping(activeChat);

    setEditingMessage(null);
    setTextState("");

  }

  function deleteMessage(
    message
  ) {

    if (
      !socketRef.current ||
      !message
    ) {
      return;
    }

    socketRef.current.emit(
      SOCKET_EVENTS.DELETE_MESSAGE,
      {
        messageId:
          message._id
      }
    );

  }

  function handleKey(e) {

    if (
      e.key === "Enter" &&
      !e.shiftKey
    ) {

      e.preventDefault();

      sendMessage();

    }

    if (
      e.key === "Escape" &&
      editingMessage
    ) {

      e.preventDefault();

      cancelEditMessage();

    }

    if (
      e.key === "Escape" &&
      replyMessage
    ) {

      e.preventDefault();

      cancelReplyMessage();

    }

  }

  const chatId =
    activeChat
      ? getChatId(
          username,
          activeChat
        )
      : null;

  const messages =
    useMemo(() => {

      return (
        chats[chatId] || []
      );

    }, [
      chats,
      chatId
    ]);

  const activeDialog =
    useMemo(() => {

      return dialogs?.find(
        d =>
          d.username === activeChat
      );

    }, [
      dialogs,
      activeChat
    ]);

  return {
    activeChat,
    setActiveChat,

    text,
    setText,

    editingMessage,
    startEditMessage,
    cancelEditMessage,

    replyMessage,
    startReplyMessage,
    cancelReplyMessage,

    deleteMessage,
    deleteChat,

    chatId,
    messages,
    activeDialog,

    openChat,
    sendMessage,
    sendAttachment,
    handleKey
  };

}