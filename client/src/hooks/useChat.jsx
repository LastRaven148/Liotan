import { playSentSound } from "../utils/notificationSound";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getChatId } from "../utils/chat";
import { SOCKET_EVENTS } from "../constants/socketEvents";
import { uploadAttachmentApi } from "../services/api";
import { encryptedTextToTransport, encryptAttachmentFileForChat, encryptTextForChat, getEffectiveE2EEChatKey } from "../utils/e2ee";
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
  const sendingRef = useRef(false);
  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);
  const activeDialog = useMemo(() => {
    return dialogs?.find(dialog => dialog.chatKey === activeChat || dialog.username === activeChat);
  }, [dialogs, activeChat]);
  const isGroupChat = activeDialog?.type === "group";
  function getDialogForChat(target) {
    return dialogs?.find(item => item.chatKey === target || item.username === target);
  }
  function getE2EEChatKey(target) {
    return getEffectiveE2EEChatKey(target, getDialogForChat(target));
  }
  const stopTyping = useCallback((chat = activeChatRef.current) => {
    if (!socketRef.current || !chat || chat === username || chat.startsWith?.("group:")) {
      return;
    }
    socketRef.current.emit(SOCKET_EVENTS.STOP_TYPING, {
      to: chat
    });
    typingChatRef.current = null;
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
  }, [
    socketRef,
    username
  ]);

  useEffect(() => {
    window.history.replaceState({
      liotanScreen: "dialogs"
    }, "");
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
  }, [stopTyping]);
  function startTyping(chat) {
    if (!socketRef.current || !chat || chat === username || chat.startsWith?.("group:")) {
      return;
    }
    if (typingChatRef.current !== chat) {
      socketRef.current.emit(SOCKET_EVENTS.TYPING, {
        to: chat
      });
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
    window.history.pushState({
      liotanScreen: "chat",
      chat: chatKey
    }, "");
    setUnread(prev => ({
      ...prev,
      [chatKey]: 0
    }));
    const socket = socketRef.current;
    if (!socket) return;
    const dialog = dialogs?.find(item => item.chatKey === chatKey || item.username === chatKey);
    if (dialog?.type === "group") {
      socket.emit(SOCKET_EVENTS.JOIN_GROUP, {
        groupId: dialog.groupId
      });
      socket.emit(SOCKET_EVENTS.GET_GROUP_CHAT, {
        groupId: dialog.groupId
      });
      return;
    }
    const chatId = getChatId(username, chatKey);
    socket.emit(SOCKET_EVENTS.JOIN_CHAT, chatId);
    socket.emit(SOCKET_EVENTS.GET_CHAT, {
      user2: chatKey
    });
  }
  function closeChat() {
    if (!activeChatRef.current) return;
    stopTyping(activeChatRef.current);
    setActiveChat(null);
    setEditingMessage(null);
    setReplyMessage(null);
    setTextState("");
  }
  function getConversationParticipants(target) {
    const dialog = dialogs?.find(item => item.chatKey === target || item.username === target);
    if (dialog?.type === "group") {
      const members = Array.isArray(dialog.members) ? dialog.members : Array.isArray(dialog.memberUsers) ? dialog.memberUsers.map(user => user.username) : [];
      return [...new Set([username, ...members.filter(Boolean)])];
    }
    return [...new Set([username, target].filter(Boolean))];
  }

  function emitWithAck(eventName, payload, timeoutMs = 12000) {
    const socket = socketRef.current;

    if (!socket || !socket.connected) {
      return Promise.resolve({ ok: false, error: "socket-disconnected" });
    }

    return new Promise(resolve => {
      let done = false;
      const timer = window.setTimeout(() => {
        if (done) {
          return;
        }
        done = true;
        resolve({ ok: false, error: "socket-timeout" });
      }, timeoutMs);

      socket.emit(eventName, payload, response => {
        if (done) {
          return;
        }
        done = true;
        window.clearTimeout(timer);
        resolve(response || { ok: true });
      });
    });
  }

  async function emitMessage({
    target,
    messageText = "",
    attachment = null
  }) {
    if (!socketRef.current || !target) {
      return false;
    }
    const dialog = getDialogForChat(target);
    const encryptedText = await encryptTextForChat({
      username,
      chatKey: getE2EEChatKey(target),
      participants: getConversationParticipants(target),
      text: messageText
    });
    const encryptedPayload = encryptedTextToTransport(encryptedText);
    if (dialog?.type === "group") {
      const result = await emitWithAck(SOCKET_EVENTS.SEND_GROUP_MESSAGE, {
        groupId: dialog.groupId,
        text: encryptedPayload.text,
        encryptedContent: encryptedPayload.encryptedContent,
        attachment,
        replyTo: replyMessage ? {
          messageId: replyMessage._id
        } : null
      });
      return Boolean(result?.ok);
    }

    const result = await emitWithAck(SOCKET_EVENTS.SEND_MESSAGE, {
      to: target,
      text: encryptedPayload.text,
      encryptedContent: encryptedPayload.encryptedContent,
      attachment,
      replyTo: replyMessage ? {
        messageId: replyMessage._id
      } : null
    });

    return Boolean(result?.ok);
  }
  async function sendMessage(attachment = null) {
    if (sendingRef.current) {
      return false;
    }
    if (!socketRef.current || !activeChat) {
      return false;
    }
    const hasText = text.trim().length > 0;
    const hasAttachment = Boolean(attachment);
    if (editingMessage && hasText) {
      const encryptedEditText = await encryptTextForChat({
        username,
        chatKey: getE2EEChatKey(activeChat),
        participants: getConversationParticipants(activeChat),
        text
      });
      const encryptedEditPayload = encryptedTextToTransport(encryptedEditText);
      socketRef.current.emit(SOCKET_EVENTS.EDIT_MESSAGE, {
        messageId: editingMessage._id,
        text: encryptedEditPayload.text,
        encryptedContent: encryptedEditPayload.encryptedContent
      });
      stopTyping(activeChat);
      setEditingMessage(null);
      setReplyMessage(null);
      setTextState("");
      return true;
    }
    if (!hasText && !hasAttachment) {
      return false;
    }
    sendingRef.current = true;
    try {
      const ok = await emitMessage({
        target: activeChat,
        messageText: hasText ? text : "",
        attachment
      });
      if (!ok) return false;
      playSentSound();
      stopTyping(activeChat);
      setReplyMessage(null);
      setTextState("");
      return true;
    } catch (err) {
      if (import.meta.env.DEV) console.warn(err);
      alert(err?.message || "Сообщение не отправлено: безопасный ключ недоступен");
      return false;
    } finally {
      window.setTimeout(() => {
        sendingRef.current = false;
      }, 350);
    }
  }
  function sealEncryptedAttachmentForTransport(attachment, encryptedFile) {
    if (!attachment || !encryptedFile?.metadata) return attachment;
    return {
      ...attachment,
      e2eeMedia: encryptedFile.metadata,
      type: "file",
      mimeType: "application/octet-stream",
      name: "Liotan encrypted media",
      size: 0,
      width: 0,
      height: 0,
      duration: 0,
      waveform: []
    };
  }

  async function sendAttachments(files, caption = "") {
    if (sendingRef.current) {
      return false;
    }
    if (!socketRef.current || !activeChat || !files?.length) {
      return false;
    }
    const target = activeChat;
    const safeFiles = Array.from(files).slice(0, 10);
    const captionText = caption.trim();
    const captionIndex = safeFiles.length - 1;
    sendingRef.current = true;
    try {
      for (let i = 0; i < safeFiles.length; i += 1) {
        const encryptedFile = await encryptAttachmentFileForChat({
          username,
          chatKey: getE2EEChatKey(target),
          participants: getConversationParticipants(target),
          file: safeFiles[i]
        });
        const attachment = await uploadAttachmentApi(encryptedFile.uploadFile);
        const sealedAttachment = sealEncryptedAttachmentForTransport(attachment, encryptedFile);
        const ok = await emitMessage({
          target,
          messageText: i === captionIndex ? captionText : "",
          attachment: sealedAttachment
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
      if (import.meta.env.DEV) console.warn(err);
      alert(err?.message || "Не удалось отправить файл");
      return false;
    } finally {
      window.setTimeout(() => {
        sendingRef.current = false;
      }, 350);
    }
  }
  function deleteChat(chat = activeChat, options = {}) {
    if (!socketRef.current || !chat) return;
    const dialog = dialogs?.find(item => item.chatKey === chat || item.username === chat);
    if (dialog?.type === "group") return;
    stopTyping(chat);
    socketRef.current.emit(SOCKET_EVENTS.DELETE_CHAT, {
      user2: chat,
      forEveryone: options.forEveryone !== false
    });
  }
  async function sendVoiceMessage(file, duration = 0, waveform = []) {
    if (!file || !socketRef.current || !activeChat) {
      return false;
    }
    try {
      const encryptedFile = await encryptAttachmentFileForChat({
        username,
        chatKey: getE2EEChatKey(activeChat),
        participants: getConversationParticipants(activeChat),
        file,
        originalTypeOverride: "voice",
        uploadExtension: ".liotanvoice",
        privateMetadata: {
          duration: Number(duration) || 0,
          waveform: Array.isArray(waveform) ? waveform.slice(0, 64) : []
        }
      });
      const attachment = await uploadAttachmentApi(encryptedFile.uploadFile);
      const sealedAttachment = sealEncryptedAttachmentForTransport(attachment, encryptedFile);
      return await sendMessage(sealedAttachment);
    } catch (err) {
      if (import.meta.env.DEV) console.warn(err);
      alert(err?.message || "Не удалось отправить голосовое сообщение");
      return false;
    }
  }
  async function sendAttachment(file) {
    if (!file || !socketRef.current || !activeChat) {
      return false;
    }
    try {
      const encryptedFile = await encryptAttachmentFileForChat({
        username,
        chatKey: getE2EEChatKey(activeChat),
        participants: getConversationParticipants(activeChat),
        file
      });
      const attachment = await uploadAttachmentApi(encryptedFile.uploadFile);
      const sealedAttachment = sealEncryptedAttachmentForTransport(attachment, encryptedFile);
      return await sendMessage(sealedAttachment);
    } catch (err) {
      if (import.meta.env.DEV) console.warn(err);
      alert(err?.message || "Не удалось отправить файл");
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
    socketRef.current.emit(SOCKET_EVENTS.PIN_MESSAGE, {
      messageId: message._id
    });
  }
  function deleteMessage(message, options = {}) {
    if (!socketRef.current || !message) {
      return;
    }
    socketRef.current.emit(SOCKET_EVENTS.DELETE_MESSAGE, {
      messageId: message._id,
      forEveryone: Boolean(options.forEveryone)
    });
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
  const chatId = activeChat ? isGroupChat ? activeChat : getChatId(username, activeChat) : null;
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
    sendVoiceMessage,
    handleKey
  };
}
