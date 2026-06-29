import {
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

import { getChatId } from "../utils/chat";
import { SOCKET_EVENTS } from "../constants/socketEvents";
import { uploadAttachmentApi } from "../services/api";
import { encryptTextForChat } from "../utils/e2ee";

export default function useChat({
  username,
  socketRef,
  setUnread,
  chats,
  dialogs
}) {
  const [activeChat, setActiveChat] = useState(null);
  const [text, setTextState] = useState("");
  const [editingMessage, setEditingMessage] = useState(null);
  const [replyMessage, setReplyMessage] = useState(null);

  const activeChatRef = useRef(null);
  const typingTimerRef = useRef(null);
  const typingChatRef = useRef(null);

  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

  const activeDialog = useMemo(() => {
    return dialogs?.find(dialog =>
      dialog.chatKey === activeChat ||
      dialog.username === activeChat
    );
  }, [dialogs, activeChat]);

  const isGroupChat = activeDialog?.type === "group";

  useEffect(() => {
    window.history.replaceState(
      { liotanScreen: "dialogs" },
      ""
    );

    function handleBrowserBack() {
      if (!activeChatRef.current) return;

      stopTyping(activeChatRef.current);
      setActiveChat(null);
      setEditingMessage(null);
      setReplyMessage(null);
      setTextState("");
    }

    window.addEventListener("popstate", handleBrowserBack);

    return () => {
      window.removeEventListener("popstate", handleBrowserBack);
    };
  }, []);

  function stopTyping(chat = activeChat) {
    if (
      !socketRef.current ||
      !chat ||
      chat === username ||
      chat.startsWith?.("group:")
    ) {
      return;
    }

    socketRef.current.emit(
      SOCKET_EVENTS.STOP_TYPING,
      { to: chat }
    );

    typingChatRef.current = null;

    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
  }

  function startTyping(chat) {
    if (
      !socketRef.current ||
      !chat ||
      chat === username ||
      chat.startsWith?.("group:")
    ) {
      return;
    }

    if (typingChatRef.current !== chat) {
      socketRef.current.emit(
        SOCKET_EVENTS.TYPING,
        { to: chat }
      );

      typingChatRef.current = chat;
    }

    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
    }

    typingTimerRef.current = setTimeout(() => {
      stopTyping(chat);
    }, 1200);
  }

  function setText(value) {
    setTextState(value);

    if (value.trim().length > 0) {
      startTyping(activeChat);
      return;
    }

    stopTyping(activeChat);
  }

  function openChat(chatKey) {
    if (activeChat === chatKey) return;

    stopTyping(activeChat);

    setActiveChat(chatKey);
    setEditingMessage(null);
    setReplyMessage(null);
    setTextState("");

    window.history.pushState(
      {
        liotanScreen: "chat",
        chat: chatKey
      },
      ""
    );

    setUnread(prev => ({
      ...prev,
      [chatKey]: 0
    }));

    const socket = socketRef.current;

    if (!socket) return;

    const dialog = dialogs?.find(item =>
      item.chatKey === chatKey ||
      item.username === chatKey
    );

    if (dialog?.type === "group") {
      socket.emit(
        SOCKET_EVENTS.JOIN_GROUP,
        { groupId: dialog.groupId }
      );

      socket.emit(
        SOCKET_EVENTS.GET_GROUP_CHAT,
        { groupId: dialog.groupId }
      );

      return;
    }

    const chatId = getChatId(username, chatKey);

    socket.emit(SOCKET_EVENTS.JOIN_CHAT, chatId);

    socket.emit(
      SOCKET_EVENTS.GET_CHAT,
      { user2: chatKey }
    );
  }

  function closeChat() {
    if (!activeChatRef.current) return;

    stopTyping(activeChatRef.current);

    setActiveChat(null);
    setEditingMessage(null);
    setReplyMessage(null);
    setTextState("");
  }

  async function emitMessage({
    target,
    messageText = "",
    attachment = null
  }) {
    if (!socketRef.current || !target) {
      return false;
    }

    const dialog = dialogs?.find(item =>
      item.chatKey === target ||
      item.username === target
    );

    const encryptedText = await encryptTextForChat({
      username,
      chatKey: target,
      text: messageText
    });

    if (dialog?.type === "group") {
      socketRef.current.emit(
        SOCKET_EVENTS.SEND_GROUP_MESSAGE,
        {
          groupId: dialog.groupId,
          text: encryptedText,
          attachment,
          replyTo: replyMessage
            ? { messageId: replyMessage._id }
            : null
        }
      );

      return true;
    }

    socketRef.current.emit(
      SOCKET_EVENTS.SEND_MESSAGE,
      {
        to: target,
        text: encryptedText,
        attachment,
        replyTo: replyMessage
          ? { messageId: replyMessage._id }
          : null
      }
    );

    return true;
  }

  async function sendMessage(attachment = null) {
    if (!socketRef.current || !activeChat) {
      return false;
    }

    const hasText = text.trim().length > 0;
    const hasAttachment = Boolean(attachment);

    if (editingMessage && hasText) {
      socketRef.current.emit(
        SOCKET_EVENTS.EDIT_MESSAGE,
        {
          messageId: editingMessage._id,
          text
        }
      );

      stopTyping(activeChat);

      setEditingMessage(null);
      setReplyMessage(null);
      setTextState("");

      return true;
    }

    if (!hasText && !hasAttachment) {
      return false;
    }

    const ok = await emitMessage({
      target: activeChat,
      messageText: hasText ? text : "",
      attachment
    });

    if (!ok) return false;

    stopTyping(activeChat);

    setReplyMessage(null);
    setTextState("");

    return true;
  }

  async function sendAttachments(files, caption = "") {
    if (
      !socketRef.current ||
      !activeChat ||
      !files?.length
    ) {
      return false;
    }

    const target = activeChat;
    const safeFiles = Array.from(files).slice(0, 10);
    const captionText = caption.trim();
    const captionIndex = safeFiles.length - 1;

    try {
      for (let i = 0; i < safeFiles.length; i += 1) {
        const attachment =
          await uploadAttachmentApi(safeFiles[i]);

        const ok = await emitMessage({
          target,
          messageText:
            i === captionIndex
              ? captionText
              : "",
          attachment
        });

        if (!ok) {
          return false;
        }
      }

      stopTyping(target);

      setReplyMessage(null);
      setTextState("");

      return true;
    } catch (err) {
      console.error(err);

      alert(
        err?.message ||
        "Не удалось отправить файл"
      );

      return false;
    }
  }

  function deleteChat(
    chat = activeChat,
    options = {}
  ) {
    if (!socketRef.current || !chat) return;

    const dialog = dialogs?.find(item =>
      item.chatKey === chat ||
      item.username === chat
    );

    if (dialog?.type === "group") return;

    stopTyping(chat);

    socketRef.current.emit(
      SOCKET_EVENTS.DELETE_CHAT,
      {
        user2: chat,
        forEveryone:
          options.forEveryone !== false
      }
    );
  }

  async function sendAttachment(file) {
    if (!file || !socketRef.current || !activeChat) {
      return false;
    }

    try {
      const attachment = await uploadAttachmentApi(file);

      return await sendMessage(attachment);
    } catch (err) {
      console.error(err);

      alert(
        err?.message ||
        "Не удалось отправить файл"
      );

      return false;
    }
  }

  function startEditMessage(message) {
    if (!message || message.from !== username) return;

    stopTyping(activeChat);

    setReplyMessage(null);
    setEditingMessage(message);
    setTextState(message.text || "");
  }

  function startReplyMessage(message) {
    if (!message) return;

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

  function pinMessage(message) {
    if (!socketRef.current || !message?._id) {
      return;
    }

    socketRef.current.emit(
      SOCKET_EVENTS.PIN_MESSAGE,
      { messageId: message._id }
    );
  }

  function deleteMessage(message, options = {}) {
    if (!socketRef.current || !message) {
      return;
    }

    socketRef.current.emit(
      SOCKET_EVENTS.DELETE_MESSAGE,
      {
        messageId: message._id,
        forEveryone: Boolean(options.forEveryone)
      }
    );
  }

  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }

    if (e.key === "Escape" && editingMessage) {
      e.preventDefault();
      cancelEditMessage();
    }

    if (e.key === "Escape" && replyMessage) {
      e.preventDefault();
      cancelReplyMessage();
    }
  }

  const chatId = activeChat
    ? isGroupChat
      ? activeChat
      : getChatId(username, activeChat)
    : null;

  const messages = useMemo(() => {
    return chats[chatId] || [];
  }, [chats, chatId]);

  return {
    activeChat,
    setActiveChat,
    closeChat,

    text,
    setText,

    editingMessage,
    startEditMessage,
    cancelEditMessage,

    replyMessage,
    startReplyMessage,
    cancelReplyMessage,

    deleteMessage,
    pinMessage,
    deleteChat,

    chatId,
    messages,
    activeDialog,

    openChat,
    sendMessage,
    sendAttachment,
    sendAttachments,
    handleKey
  };
}