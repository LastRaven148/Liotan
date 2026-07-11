import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SOCKET_EVENTS } from "../constants/socketEvents";
import { getMlsEngine } from "../crypto/mlsEngine";
import { getChatId } from "../utils/chat";
import { playSentSound } from "../utils/notificationSound";

export default function useChat({ username, socketRef, setUnread, chats, dialogs }) {
  const [activeChat, setActiveChat] = useState(null);
  const [text, setTextState] = useState("");
  const [editingMessage, setEditingMessage] = useState(null);
  const [replyMessage, setReplyMessage] = useState(null);
  const activeChatRef = useRef(null);
  const typingTimerRef = useRef(null);
  const typingChatRef = useRef(null);
  const sendingRef = useRef(false);

  useEffect(() => { activeChatRef.current = activeChat; }, [activeChat]);

  const activeDialog = useMemo(
    () => dialogs?.find(dialog => dialog.chatKey === activeChat || dialog.username === activeChat),
    [dialogs, activeChat]
  );
  const isGroupChat = activeDialog?.type === "group";
  const getDialogForChat = target => dialogs?.find(item => item.chatKey === target || item.username === target);

  const stopTyping = useCallback((chat = activeChatRef.current) => {
    if (!socketRef.current || !chat || chat === username || chat.startsWith?.("group:")) return;
    socketRef.current.emit(SOCKET_EVENTS.STOP_TYPING, { to: chat });
    typingChatRef.current = null;
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = null;
  }, [socketRef, username]);

  useEffect(() => {
    window.history.replaceState({ liotanScreen: "dialogs" }, "");
    function handleBrowserBack() {
      if (!activeChatRef.current) return;
      stopTyping(activeChatRef.current);
      setActiveChat(null);
      setEditingMessage(null);
      setReplyMessage(null);
      setTextState("");
    }
    window.addEventListener("popstate", handleBrowserBack);
    return () => window.removeEventListener("popstate", handleBrowserBack);
  }, [stopTyping]);

  function startTyping(chat) {
    if (!socketRef.current || !chat || chat === username || chat.startsWith?.("group:")) return;
    if (typingChatRef.current !== chat) {
      socketRef.current.emit(SOCKET_EVENTS.TYPING, { to: chat });
      typingChatRef.current = chat;
    }
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => stopTyping(chat), 1200);
  }

  function setText(value) {
    setTextState(value);
    if (value.trim()) startTyping(activeChat);
    else stopTyping(activeChat);
  }

  function openChat(chatKey) {
    if (activeChat === chatKey) return;
    stopTyping(activeChat);
    setActiveChat(chatKey);
    setEditingMessage(null);
    setReplyMessage(null);
    setTextState("");
    window.history.pushState({ liotanScreen: "chat", chat: chatKey }, "");
    setUnread(previous => ({ ...previous, [chatKey]: 0 }));

    const dialog = getDialogForChat(chatKey);
    getMlsEngine().ensureConversation(chatKey, dialog).catch(err => {
      if (import.meta.env.DEV) console.warn("MLS conversation is not ready", err);
    });

    // Legacy history remains read-only during migration.
    const socket = socketRef.current;
    if (!socket) return;
    if (dialog?.type === "group") {
      socket.emit(SOCKET_EVENTS.JOIN_GROUP, { groupId: dialog.groupId });
      socket.emit(SOCKET_EVENTS.GET_GROUP_CHAT, { groupId: dialog.groupId });
    } else {
      socket.emit(SOCKET_EVENTS.JOIN_CHAT, getChatId(username, chatKey));
      socket.emit(SOCKET_EVENTS.GET_CHAT, { user2: chatKey });
    }
  }

  function closeChat() {
    if (!activeChatRef.current) return;
    stopTyping(activeChatRef.current);
    setActiveChat(null);
    setEditingMessage(null);
    setReplyMessage(null);
    setTextState("");
  }

  async function sendMessage(file = null) {
    if (sendingRef.current || !activeChat) return false;
    const hasText = Boolean(text.trim());
    const hasFile = file instanceof File;
    if (!hasText && !hasFile) return false;
    sendingRef.current = true;
    try {
      if (editingMessage && hasText) {
        await getMlsEngine().sendControl({
          chatKey: activeChat,
          dialog: getDialogForChat(activeChat),
          kind: "edit",
          targetMessageId: editingMessage._id,
          text
        });
        setEditingMessage(null);
      } else {
        await getMlsEngine().sendMessage({
          chatKey: activeChat,
          dialog: getDialogForChat(activeChat),
          text: hasText ? text : "",
          file: hasFile ? file : null,
          replyTo: replyMessage
        });
      }
      playSentSound();
      stopTyping(activeChat);
      setReplyMessage(null);
      setTextState("");
      return true;
    } catch (err) {
      if (import.meta.env.DEV) console.warn(err);
      alert(err?.message || "Сообщение не отправлено: MLS-шифрование недоступно");
      return false;
    } finally {
      window.setTimeout(() => { sendingRef.current = false; }, 350);
    }
  }

  async function sendAttachments(files, caption = "") {
    if (sendingRef.current || !activeChat || !files?.length) return false;
    const safeFiles = Array.from(files).slice(0, 10);
    const target = activeChat;
    sendingRef.current = true;
    try {
      for (let index = 0; index < safeFiles.length; index += 1) {
        await getMlsEngine().sendMessage({
          chatKey: target,
          dialog: getDialogForChat(target),
          text: index === safeFiles.length - 1 ? caption.trim() : "",
          file: safeFiles[index],
          replyTo: replyMessage
        });
      }
      stopTyping(target);
      setReplyMessage(null);
      setTextState("");
      return true;
    } catch (err) {
      if (import.meta.env.DEV) console.warn(err);
      alert(err?.message || "Не удалось безопасно отправить файл");
      return false;
    } finally {
      window.setTimeout(() => { sendingRef.current = false; }, 350);
    }
  }

  async function sendVoiceMessage(file, duration = 0, waveform = []) {
    if (!file || !activeChat) return false;
    try {
      const result = await getMlsEngine().sendMessage({
        chatKey: activeChat,
        dialog: getDialogForChat(activeChat),
        file,
        mediaOptions: {
          originalTypeOverride: "voice",
          privateMetadata: {
            duration: Number(duration) || 0,
            waveform: Array.isArray(waveform) ? waveform.slice(0, 64) : []
          }
        },
        replyTo: replyMessage
      });
      return Boolean(result?.ok);
    } catch (err) {
      alert(err?.message || "Не удалось безопасно отправить голосовое сообщение");
      return false;
    }
  }

  async function sendAttachment(file) {
    if (!file || !activeChat) return false;
    try {
      const result = await getMlsEngine().sendMessage({
        chatKey: activeChat,
        dialog: getDialogForChat(activeChat),
        file,
        replyTo: replyMessage
      });
      return Boolean(result?.ok);
    } catch (err) {
      alert(err?.message || "Не удалось безопасно отправить файл");
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
  function cancelReplyMessage() { setReplyMessage(null); }
  function cancelEditMessage() { stopTyping(activeChat); setEditingMessage(null); setTextState(""); }

  function sendControl(kind, message, textValue = "") {
    if (!activeChat || !message?._id) return;
    getMlsEngine().sendControl({
      chatKey: activeChat,
      dialog: getDialogForChat(activeChat),
      kind,
      targetMessageId: message._id,
      text: textValue
    }).catch(err => alert(err?.message || "Защищённое действие не отправлено"));
  }
  function pinMessage(message) { sendControl("pin", message); }
  function deleteMessage(message, options = {}) {
    if (!message?._id) return;
    if (message.from === username && options.forEveryone) {
      sendControl("delete", message);
      return;
    }
    window.dispatchEvent(new CustomEvent("liotan:mls-event", {
      detail: { type: "delete", chatId, messageId: message._id, localOnly: true }
    }));
  }

  function deleteChat(chat = activeChat, options = {}) {
    if (!socketRef.current || !chat) return;
    const dialog = getDialogForChat(chat);
    if (dialog?.type === "group") return;
    stopTyping(chat);
    // This deletes only legacy server history. MLS peers may retain authenticated copies.
    socketRef.current.emit(SOCKET_EVENTS.DELETE_CHAT, { user2: chat, forEveryone: options.forEveryone !== false });
  }

  function handleKey(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    } else if (event.key === "Escape" && editingMessage) {
      event.preventDefault(); cancelEditMessage();
    } else if (event.key === "Escape" && replyMessage) {
      event.preventDefault(); cancelReplyMessage();
    }
  }

  const chatId = activeChat ? (isGroupChat ? activeChat : getChatId(username, activeChat)) : null;
  const messages = useMemo(() => chats[chatId] || [], [chats, chatId]);

  return {
    activeChat, setActiveChat, closeChat, text, setText,
    editingMessage, startEditMessage, cancelEditMessage,
    replyMessage, startReplyMessage, cancelReplyMessage,
    deleteMessage, pinMessage, deleteChat,
    chatId, messages, activeDialog, openChat,
    sendMessage, sendAttachment, sendAttachments, sendVoiceMessage, handleKey
  };
}
