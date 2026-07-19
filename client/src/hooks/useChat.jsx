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
  const restoredChatRef = useRef("");
  const chatOwnerRef = useRef(username);
  const pendingObjectUrlsRef = useRef(new Map());

  useEffect(() => { activeChatRef.current = activeChat; }, [activeChat]);
  useEffect(() => () => {
    pendingObjectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    pendingObjectUrlsRef.current.clear();
  }, []);

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
    if (chatOwnerRef.current === username) return;
    stopTyping(activeChatRef.current);
    chatOwnerRef.current = username;
    restoredChatRef.current = "";
    setActiveChat(null);
    setEditingMessage(null);
    setReplyMessage(null);
    setTextState("");
  }, [username, stopTyping]);

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

  function openChat(chatKey, options = {}) {
    if (activeChat === chatKey) return;
    stopTyping(activeChat);
    setActiveChat(chatKey);
    setEditingMessage(null);
    setReplyMessage(null);
    setTextState("");
    localStorage.setItem(`liotan:last-chat:${encodeURIComponent(username)}`, String(chatKey));
    if (options.replaceHistory) {
      window.history.replaceState({ liotanScreen: "chat", chat: chatKey }, "");
    } else {
      window.history.pushState({ liotanScreen: "chat", chat: chatKey }, "");
    }
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
    } else {
      socket.emit(SOCKET_EVENTS.JOIN_CHAT, getChatId(username, chatKey));
    }
  }

  useEffect(() => {
    if (restoredChatRef.current === username || !username || !dialogs?.length) return;
    restoredChatRef.current = username;
    const saved = String(localStorage.getItem(`liotan:last-chat:${encodeURIComponent(username)}`) || "");
    const savedExists = dialogs.some(dialog => dialog.chatKey === saved || dialog.username === saved);
    const ownDialogExists = dialogs.some(dialog => dialog.chatKey === username || dialog.username === username);
    const target = savedExists ? saved : ownDialogExists ? username : "";
    if (target) openChat(target, { replaceHistory: true });
  }, [username, dialogs]);

  function closeChat() {
    if (!activeChatRef.current) return;
    stopTyping(activeChatRef.current);
    setActiveChat(null);
    setEditingMessage(null);
    setReplyMessage(null);
    setTextState("");
  }

  function pendingChatId(target, dialog) {
    return dialog?.type === "group" ? target : getChatId(username, target);
  }

  function pendingAttachment(file) {
    if (!(file instanceof File)) return null;
    const url = URL.createObjectURL(file);
    const type = file.type.startsWith("image/")
      ? "photo"
      : file.type.startsWith("video/")
        ? "video"
        : file.type.startsWith("audio/")
          ? "audio"
          : "file";
    return { url, name: file.name, mimeType: file.type, size: file.size, type, pending: true };
  }

  function dispatchPendingMessage({ target, dialog, clientMessageId, textValue = "", file = null, replyTo = null }) {
    const attachment = pendingAttachment(file);
    if (attachment?.url) pendingObjectUrlsRef.current.set(clientMessageId, attachment.url);
    window.dispatchEvent(new CustomEvent("liotan:mls-event", {
      detail: {
        type: "message",
        message: {
          _id: clientMessageId,
          chatId: pendingChatId(target, dialog),
          chatType: dialog?.type === "group" ? "group" : "private",
          groupId: dialog?.groupId || "",
          from: username,
          to: dialog?.type === "group" ? "" : target,
          text: textValue,
          attachment,
          replyTo,
          createdAt: new Date().toISOString(),
          status: "sending",
          progress: file ? 0.02 : 0.35,
          mls: { pending: true, sequence: 0 }
        }
      }
    }));
  }

  function updatePendingStatus(target, dialog, clientMessageId, status, progress, error = "") {
    window.dispatchEvent(new CustomEvent("liotan:mls-event", {
      detail: {
        type: "status",
        chatId: pendingChatId(target, dialog),
        messageId: clientMessageId,
        status,
        progress,
        error
      }
    }));
  }

  function mediaProgress(target, dialog, clientMessageId, detail) {
    const ratio = detail.total > 0 ? Math.max(0, Math.min(1, detail.completed / detail.total)) : 0;
    const progress = detail.stage === "encrypting" ? 0.05 + ratio * 0.5 : 0.6 + ratio * 0.3;
    updatePendingStatus(target, dialog, clientMessageId, "sending", progress);
  }

  function releasePendingObjectUrl(clientMessageId) {
    const url = pendingObjectUrlsRef.current.get(clientMessageId);
    if (!url) return;
    pendingObjectUrlsRef.current.delete(clientMessageId);
    requestAnimationFrame(() => requestAnimationFrame(() => URL.revokeObjectURL(url)));
  }

  async function sendMessage(file = null) {
    if (!activeChat) return false;
    const hasText = Boolean(text.trim());
    const hasFile = file instanceof File;
    if (!hasText && !hasFile) return false;
    const target = activeChat;
    const dialog = getDialogForChat(target);
    const textValue = hasText ? text : "";
    const replyTo = replyMessage;
    let pendingId = "";
    try {
      if (editingMessage && hasText) {
        await getMlsEngine().sendControl({
          chatKey: target,
          dialog,
          kind: "edit",
          targetMessageId: editingMessage._id,
          text
        });
        setEditingMessage(null);
      } else {
        const clientMessageId = crypto.randomUUID();
        pendingId = clientMessageId;
        dispatchPendingMessage({ target, dialog, clientMessageId, textValue, file: hasFile ? file : null, replyTo });
        stopTyping(target);
        setReplyMessage(null);
        setTextState("");
        await getMlsEngine().sendMessage({
          chatKey: target,
          dialog,
          text: textValue,
          file: hasFile ? file : null,
          mediaOptions: {
            onProgress: detail => mediaProgress(target, dialog, clientMessageId, detail)
          },
          replyTo,
          clientMessageId
        });
        releasePendingObjectUrl(clientMessageId);
      }
      playSentSound();
      stopTyping(target);
      setReplyMessage(null);
      setTextState("");
      return true;
    } catch (err) {
      if (import.meta.env.DEV) console.warn(err);
      if (pendingId) updatePendingStatus(target, dialog, pendingId, "failed", 0, err?.message || "MLS send failed");
      alert(err?.message || "Сообщение не отправлено: MLS-шифрование недоступно");
      return false;
    }
  }

  async function sendAttachments(files, caption = "", metadata = []) {
    if (sendingRef.current || !activeChat || !files?.length) return false;
    const safeFiles = Array.from(files).slice(0, 10);
    const target = activeChat;
    const dialog = getDialogForChat(target);
    const replyTo = replyMessage;
    const pending = safeFiles.map((file, index) => ({
      file,
      clientMessageId: crypto.randomUUID(),
      textValue: index === safeFiles.length - 1 ? caption.trim() : ""
    }));
    let sentCount = 0;
    let firstError = null;
    sendingRef.current = true;
    pending.forEach(item => dispatchPendingMessage({
      target,
      dialog,
      clientMessageId: item.clientMessageId,
      textValue: item.textValue,
      file: item.file,
      replyTo
    }));
    stopTyping(target);
    setReplyMessage(null);
    setTextState("");
    try {
      for (let index = 0; index < pending.length; index += 1) {
        const item = pending[index];
        try {
          await getMlsEngine().sendMessage({
            chatKey: target,
            dialog,
            text: item.textValue,
            file: item.file,
            mediaOptions: {
              privateMetadata: metadata[index] || {},
              onProgress: detail => mediaProgress(target, dialog, item.clientMessageId, detail)
            },
            replyTo,
            clientMessageId: item.clientMessageId
          });
          releasePendingObjectUrl(item.clientMessageId);
          sentCount += 1;
        } catch (error) {
          firstError ||= error;
          updatePendingStatus(target, dialog, item.clientMessageId, "failed", 0, error?.message || "MLS media send failed");
        }
      }
      if (firstError) {
        if (import.meta.env.DEV) console.warn(firstError);
        alert(firstError?.message || "Не удалось безопасно отправить один или несколько файлов");
      }
      return { ok: sentCount === pending.length, sentCount };
    } finally {
      sendingRef.current = false;
    }
  }

  async function sendVoiceMessage(file, duration = 0, waveform = []) {
    if (!file || !activeChat) return false;
    const target = activeChat;
    const dialog = getDialogForChat(target);
    const clientMessageId = crypto.randomUUID();
    const replyTo = replyMessage;
    dispatchPendingMessage({ target, dialog, clientMessageId, file, replyTo });
    setReplyMessage(null);
    try {
      const result = await getMlsEngine().sendMessage({
        chatKey: target,
        dialog,
        file,
        mediaOptions: {
          originalTypeOverride: "voice",
          privateMetadata: {
            duration: Number(duration) || 0,
            waveform: Array.isArray(waveform) ? waveform.slice(0, 64) : []
          },
          onProgress: detail => mediaProgress(target, dialog, clientMessageId, detail)
        },
        replyTo,
        clientMessageId
      });
      releasePendingObjectUrl(clientMessageId);
      return Boolean(result?.ok);
    } catch (err) {
      updatePendingStatus(target, dialog, clientMessageId, "failed", 0, err?.message || "MLS voice send failed");
      alert(err?.message || "Не удалось безопасно отправить голосовое сообщение");
      return false;
    }
  }

  async function sendAttachment(file) {
    if (!file || !activeChat) return false;
    const target = activeChat;
    const dialog = getDialogForChat(target);
    const clientMessageId = crypto.randomUUID();
    const replyTo = replyMessage;
    dispatchPendingMessage({ target, dialog, clientMessageId, file, replyTo });
    setReplyMessage(null);
    try {
      const result = await getMlsEngine().sendMessage({
        chatKey: target,
        dialog,
        file,
        mediaOptions: {
          onProgress: detail => mediaProgress(target, dialog, clientMessageId, detail)
        },
        replyTo,
        clientMessageId
      });
      releasePendingObjectUrl(clientMessageId);
      return Boolean(result?.ok);
    } catch (err) {
      updatePendingStatus(target, dialog, clientMessageId, "failed", 0, err?.message || "MLS attachment send failed");
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
      text: textValue,
      attachmentDelete: kind === "delete" && message.attachment?.mlsMedia?.deleteToken
        ? {
            uploadId: message.attachment.mlsMedia.uploadId,
            token: message.attachment.mlsMedia.deleteToken
          }
        : null
    }).catch(err => alert(err?.message || "Защищённое действие не отправлено"));
  }
  function pinMessage(message) { sendControl("pin", message); }
  function deleteMessage(message, options = {}) {
    if (!message?._id) return;
    if (message.from === username && options.forEveryone) {
      sendControl("delete", message);
      return;
    }
    getMlsEngine().hideMessageForAccount(activeChat, getDialogForChat(activeChat), message._id)
      .catch(err => alert(err?.message || "Не удалось скрыть сообщение на ваших устройствах"));
  }

  function deleteChat(chat = activeChat) {
    if (!chat) return;
    stopTyping(chat);
    return getMlsEngine().deleteConversation(chat, getDialogForChat(chat))
      .then(() => {
        if (activeChatRef.current === chat) closeChat();
      })
      .catch(err => alert(err?.message || "Не удалось удалить чат для всех участников"));
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

  async function loadOlderMessages() {
    if (!activeChat) return { loaded: 0, hasMore: false };
    const sequences = messages.map(message => Number(message?.mls?.sequence || 0)).filter(value => value > 0);
    if (!sequences.length) return { loaded: 0, hasMore: false };
    return getMlsEngine().loadOlderHistory(activeChat, Math.min(...sequences));
  }

  async function loadNewerMessages() {
    if (!activeChat) return { loaded: 0, hasMore: false };
    const sequences = messages.map(message => Number(message?.mls?.sequence || 0)).filter(value => value > 0);
    if (!sequences.length) return { loaded: 0, hasMore: false };
    return getMlsEngine().loadNewerHistory(activeChat, Math.max(...sequences));
  }

  return {
    activeChat, setActiveChat, closeChat, text, setText,
    editingMessage, startEditMessage, cancelEditMessage,
    replyMessage, startReplyMessage, cancelReplyMessage,
    deleteMessage, pinMessage, deleteChat,
    chatId, messages, activeDialog, openChat,
    sendMessage, sendAttachment, sendAttachments, sendVoiceMessage,
    loadOlderMessages, loadNewerMessages, handleKey
  };
}
