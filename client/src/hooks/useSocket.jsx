import { useEffect, useRef } from "react";
import io from "socket.io-client";
import { getApiCandidates } from "../config/api";
import { addMessageToChat, editMessageInChat, deleteMessageFromChat, deleteChatFromState, replaceChatHistory, updateMessagesStatus, pinMessageInChat } from "../utils/chatState";
import { SOCKET_EVENTS } from "../constants/socketEvents";
import { deleteOfflineBlobs } from "../components/chat/message/messageStorage";
import { unlockNotificationSound, playNotificationSound, notificationsEnabled, receivedSoundEnabled } from "../utils/notificationSound";

function attachmentOfflineKeys(attachment) {
  if (!attachment) return [];

  return [
    attachment.mediaId,
    attachment.uploadId,
    attachment.url
  ].filter(Boolean).map(String);
}

function messageOfflineKeys(message) {
  return attachmentOfflineKeys(message?.attachment);
}

async function purgeOfflineMedia(keys = []) {
  try {
    await deleteOfflineBlobs(keys);
  } catch (err) {
    if (import.meta.env.DEV) console.warn(err);
  }
}

function statusRank(status) {
  if (status === "read") {
    return 3;
  }
  if (status === "delivered") {
    return 2;
  }
  return 1;
}
function getMessageChatKey(msg, username) {
  if (msg.chatType === "group") {
    return msg.chatId || `group:${msg.groupId}`;
  }
  return msg.from === username ? msg.to : msg.from;
}
function mergeChatHistory(prevChats, chatId, msgs) {
  const current = prevChats[chatId] || [];
  const currentMap = new Map(current.map(msg => [String(msg._id), msg]));
  const merged = msgs.map(msg => {
    const existing = currentMap.get(String(msg._id));
    if (!existing || statusRank(msg.status) >= statusRank(existing.status)) {
      return msg;
    }
    return {
      ...msg,
      status: existing.status,
      deliveredAt: existing.deliveredAt || msg.deliveredAt,
      readAt: existing.readAt || msg.readAt
    };
  });
  return replaceChatHistory(prevChats, chatId, merged);
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
  updateUserProfile,
  removeDialog,
  setAvatar,
  setBio,
  setProfileUser,
  socketRef,
  updateGroup,
  setDisplayName,
  API
}) {
  const activeChatRef = useRef(null);
  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);
  useEffect(() => {
    if (!token) {
      return;
    }
    function unlockSoundOnUserGesture() {
      unlockNotificationSound();
      window.removeEventListener("click", unlockSoundOnUserGesture);
      window.removeEventListener("keydown", unlockSoundOnUserGesture);
    }
    window.addEventListener("click", unlockSoundOnUserGesture);
    window.addEventListener("keydown", unlockSoundOnUserGesture);
    const socketEndpoints = Array.from(new Set([
      API,
      ...getApiCandidates()
    ].filter(Boolean)));
    let activeSocketIndex = 0;
    let reconnectTimer = null;

    function createSocketConnection(endpoint = socketEndpoints[activeSocketIndex]) {
      return io(endpoint, {
        withCredentials: true,
        transports: ["websocket", "polling"],
        timeout: 12000,
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1200,
        reconnectionDelayMax: 12000
      });
    }

    function switchSocketEndpoint(reason) {
      if (socketEndpoints.length <= 1 || reconnectTimer) {
        return;
      }

      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        activeSocketIndex = (activeSocketIndex + 1) % socketEndpoints.length;
        const nextEndpoint = socketEndpoints[activeSocketIndex];

        console.warn(`[Liotan Socket] switching endpoint after ${reason}: ${nextEndpoint}`);

        socket.removeAllListeners();
        socket.disconnect();
        socket = createSocketConnection(nextEndpoint);
        socketRef.current = socket;
        attachSocketHandlers(socket);
      }, 1500);
    }

    let socket = createSocketConnection(socketEndpoints[activeSocketIndex]);
    socketRef.current = socket;

    function attachSocketHandlers(currentSocket) {
      currentSocket.on("connect", () => {
        console.info(`[Liotan Socket] connected: ${currentSocket.io.uri}`);
      });
      currentSocket.on("disconnect", reason => {
        console.warn(`[Liotan Socket] disconnected: ${reason}`);
      });
      currentSocket.on("connect_error", err => {
        console.warn("[Liotan Socket] connect_error:", err?.message || err);
        switchSocketEndpoint(err?.message || "connect_error");
      });

    function markActiveChatRead(user) {
      if (!user || user === username || user.startsWith?.("group:")) {
        return;
      }
      currentSocket.emit(SOCKET_EVENTS.MARK_CHAT_READ, {
        user2: user
      });
    }
    function notifyIncomingMessage(msg, chatKey) {
      if (!msg || msg.from === username || activeChatRef.current === chatKey) {
        return;
      }
      if (receivedSoundEnabled()) {
        playNotificationSound();
      }
      const oldTitle = document.title;
      document.title = `Новое сообщение от ${msg.from}`;
      setTimeout(() => {
        document.title = oldTitle;
      }, 2500);
      if (notificationsEnabled() && "Notification" in window && Notification.permission === "granted") {
        new Notification(msg.from || "Liotan", {
          body: msg.text || msg.attachment?.name || "Новое сообщение",
          icon: "/android-chrome-192x192.png?v=5"
        });
      }
    }
    function handleNewMessage(msg) {
      const chatKey = getMessageChatKey(msg, username);
      notifyIncomingMessage(msg, chatKey);
      setChats(prev => addMessageToChat(prev, msg));
      if (msg.from !== username && activeChatRef.current !== chatKey) {
        setUnread(prev => ({
          ...prev,
          [chatKey]: (prev[chatKey] || 0) + 1
        }));
      }
      if (msg.from !== username && activeChatRef.current === chatKey) {
        markActiveChatRead(chatKey);
        setUnread(prev => ({
          ...prev,
          [chatKey]: 0
        }));
      }
      setTypingUsers(prev => ({
        ...prev,
        [msg.from]: false
      }));
      updateDialog(msg, username);
    }
    function handleMessageEdited(msg) {
      setChats(prev => editMessageInChat(prev, msg));
      updateDialog(msg, username);
    }
    function handleMessageDeleted(data) {
      setChats(prev => deleteMessageFromChat(prev, data));
      const deleted = data.deletedMessage;
      const deletedMediaKeys = [
        ...(data.deletedMediaKeys || []),
        ...messageOfflineKeys(deleted)
      ];
      purgeOfflineMedia(deletedMediaKeys);
      if (!deleted) {
        return;
      }
      const chatKey = deleted.chatType === "group" ? deleted.chatId || `group:${deleted.groupId}` : deleted.from === username ? deleted.to : deleted.from;
      if (deleted.from !== username) {
        setUnread(prev => {
          const nextCount = Math.max(0, (prev[chatKey] || 0) - 1);
          return {
            ...prev,
            [chatKey]: nextCount
          };
        });
      }
      if (data.latestMessage) {
        updateDialog(data.latestMessage, username);
      } else {
        removeDialog(chatKey);
      }
    }
    function handleChatDeleted({
      chatId,
      user1,
      user2,
      deletedMediaKeys = []
    }) {
      purgeOfflineMedia(deletedMediaKeys);
      const dialogUsername = user1 === username ? user2 : user1;
      setChats(prev => deleteChatFromState(prev, chatId));
      setUnread(prev => ({
        ...prev,
        [dialogUsername]: 0
      }));
      setTypingUsers(prev => ({
        ...prev,
        [dialogUsername]: false
      }));
      removeDialog(dialogUsername);
      if (activeChatRef.current === dialogUsername) {
        setActiveChat(null);
      }
    }
    function handleChatHistory({
      chatId,
      msgs
    }) {
      setChats(prev => mergeChatHistory(prev, chatId, msgs));
      markActiveChatRead(activeChatRef.current);
    }
    function handleMessageDelivered(data) {
      setChats(prev => updateMessagesStatus(prev, {
        ...data,
        status: "delivered"
      }));
    }
    function handleMessageRead(data) {
      setChats(prev => updateMessagesStatus(prev, {
        ...data,
        status: "read"
      }));
    }
    function handleMessagePinned(msg) {
      setChats(prev => pinMessageInChat(prev, msg));
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
    function handleOnlineUsers(users) {
      setOnlineUsers(users);
    }
    function handleUserLastSeen({
      username: targetUsername,
      lastSeen
    }) {
      if (!targetUsername || targetUsername === username) {
        return;
      }
      updateUserLastSeen(targetUsername, lastSeen);
    }
    function handleUserProfileUpdated(profile) {
      if (!profile?.username) {
        return;
      }
      updateUserProfile?.(profile);
      setProfileUser?.(prev => {
        if (!prev || prev.username !== profile.username) {
          return prev;
        }
        return {
          ...prev,
          avatar: profile.avatar || "",
          bio: profile.bio || "",
          displayName: profile.displayName || ""
        };
      });
      if (profile.username === username) {
        setAvatar?.(profile.avatar || "");
        setBio?.(profile.bio || "");
        setDisplayName?.(profile.displayName || "");
      }
    }
    function handleUserDeleted(data) {
      const targetUsername = data?.username || data?.deletedUsername;
      if (!targetUsername) {
        return;
      }
      removeDialog(targetUsername);
      setUnread(prev => {
        const next = {
          ...prev
        };
        delete next[targetUsername];
        return next;
      });
      setTypingUsers(prev => {
        const next = {
          ...prev
        };
        delete next[targetUsername];
        return next;
      });
      setProfileUser?.(prev => prev?.username === targetUsername ? null : prev);
      if (activeChatRef.current === targetUsername) {
        setActiveChat(null);
      }
      setChats(prev => {
        const next = {
          ...prev
        };
        if (Array.isArray(data.chatIds)) {
          data.chatIds.forEach(chatId => {
            delete next[chatId];
          });
        }
        Object.keys(next).forEach(chatId => {
          if (chatId.includes(targetUsername)) {
            delete next[chatId];
          }
        });
        return next;
      });
    }
    function handleGroupUpdated(group) {
      if (!group?._id) {
        return;
      }
      const chatKey = `group:${group._id}`;
      const isMember = (group.members || []).includes(username);
      if (!isMember) {
        removeDialog(chatKey);
        if (activeChatRef.current === chatKey) {
          setActiveChat(null);
        }
        return;
      }
      updateGroup?.(group);
    }
    function handleGroupDeleted(data) {
      purgeOfflineMedia(data?.deletedMediaKeys || []);
      const groupId = data?.groupId || data?._id;
      if (!groupId) {
        return;
      }
      const chatKey = `group:${groupId}`;
      removeDialog(chatKey);
      setUnread(prev => {
        const next = {
          ...prev
        };
        delete next[chatKey];
        return next;
      });
      setChats(prev => {
        const next = {
          ...prev
        };
        delete next[chatKey];
        return next;
      });
      if (activeChatRef.current === chatKey) {
        setActiveChat(null);
      }
    }
    currentSocket.on(SOCKET_EVENTS.NEW_MESSAGE, handleNewMessage);
    currentSocket.on(SOCKET_EVENTS.MESSAGE_EDITED, handleMessageEdited);
    currentSocket.on(SOCKET_EVENTS.MESSAGE_DELETED, handleMessageDeleted);
    currentSocket.on(SOCKET_EVENTS.CHAT_DELETED, handleChatDeleted);
    currentSocket.on(SOCKET_EVENTS.MESSAGE_DELIVERED, handleMessageDelivered);
    currentSocket.on(SOCKET_EVENTS.MESSAGE_READ, handleMessageRead);
    currentSocket.on(SOCKET_EVENTS.USER_TYPING, handleUserTyping);
    currentSocket.on(SOCKET_EVENTS.USER_STOPPED_TYPING, handleUserStoppedTyping);
    currentSocket.on(SOCKET_EVENTS.CHAT_HISTORY, handleChatHistory);
    currentSocket.on(SOCKET_EVENTS.ONLINE_USERS, handleOnlineUsers);
    currentSocket.on(SOCKET_EVENTS.USER_LAST_SEEN, handleUserLastSeen);
    currentSocket.on(SOCKET_EVENTS.MESSAGE_PINNED, handleMessagePinned);
    currentSocket.on(SOCKET_EVENTS.USER_PROFILE_UPDATED, handleUserProfileUpdated);
    currentSocket.on(SOCKET_EVENTS.USER_DELETED, handleUserDeleted);
    currentSocket.on(SOCKET_EVENTS.GROUP_UPDATED, handleGroupUpdated);
    currentSocket.on(SOCKET_EVENTS.GROUP_DELETED, handleGroupDeleted);
    }

    attachSocketHandlers(socket);

    return () => {
      window.removeEventListener("click", unlockSoundOnUserGesture);
      window.removeEventListener("keydown", unlockSoundOnUserGesture);
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [token, username, API, setActiveChat, setChats, setUnread, setOnlineUsers, setTypingUsers, updateDialog, updateUserLastSeen, updateUserProfile, removeDialog, setAvatar, setBio, setProfileUser, updateGroup, setDisplayName, socketRef]);
}
