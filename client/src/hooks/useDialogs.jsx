import { useState, useCallback, useMemo, useEffect } from "react";
import { getDialogs, searchUsers, getPinnedChatsApi, togglePinnedChatApi, getArchivedChatsApi, toggleArchivedChatApi, getGroupsApi, leaveGroupApi, deleteGroupApi } from "../services/api";
function normalizeAttachment(attachment) {
  if (!attachment?.url) {
    return null;
  }
  return {
    url: attachment.url || "",
    name: attachment.name || "",
    type: attachment.type || "",
    mimeType: attachment.mimeType || "",
    size: attachment.size || 0,
    width: attachment.width || 0,
    height: attachment.height || 0,
    duration: attachment.duration || 0
  };
}
function getDialogAttachment(dialog) {
  return normalizeAttachment(dialog.lastMessageAttachment || dialog.lastAttachment || dialog.attachment || null);
}
function getMessageAttachment(msg) {
  return normalizeAttachment(msg?.attachment || null);
}
function getAttachmentPreview(attachment) {
  if (!attachment) {
    return "";
  }
  if (attachment.type === "photo") {
    return "Фото";
  }
  if (attachment.type === "video") {
    return "Видео";
  }
  if (attachment.type === "voice") {
    return "Голосовое сообщение";
  }
  if (attachment.type === "audio") {
    return attachment.name || "Аудио";
  }
  if (attachment.type === "file") {
    return attachment.name || "Файл";
  }
  return attachment.name || "Файл";
}
function getPreview(value) {
  if (value?.text?.trim()) {
    return value.text;
  }
  if (value?.contentMode === "e2ee" || value?.encryptedContent?.ciphertext) {
    return "Encrypted message";
  }
  return getAttachmentPreview(getMessageAttachment(value));
}
function applyAttachmentFields(base, attachment) {
  return {
    ...base,
    attachment,
    lastMessageAttachment: attachment,
    lastAttachment: attachment,
    lastMessageType: attachment?.type || "",
    lastAttachmentName: attachment?.name || "",
    lastAttachmentUrl: attachment?.url || ""
  };
}
function normalizeGroup(group) {
  const attachment = getDialogAttachment(group);
  return applyAttachmentFields({
    type: "group",
    groupId: group._id,
    username: `group:${group._id}`,
    chatKey: `group:${group._id}`,
    title: group.name,
    name: group.name,
    description: group.description || "",
    avatar: group.avatar || "",
    lastMessage: group.lastMessage || getAttachmentPreview(attachment) || "Группа создана",
    lastMessageEncryptedContent: group.lastMessageEncryptedContent || group.encryptedContent || null,
    createdAt: group.updatedAt || group.createdAt,
    members: group.members || [],
    memberUsers: group.memberUsers || [],
    memberCount: group.memberCount || group.members?.length || group.memberUsers?.length || 0,
    owner: group.owner,
    admins: group.admins || []
  }, attachment);
}
function normalizePrivateDialog(dialog) {
  const attachment = getDialogAttachment(dialog);
  return applyAttachmentFields({
    ...dialog,
    type: "private",
    chatKey: dialog.username,
    title: dialog.username,
    name: dialog.username,
    lastMessage: dialog.lastMessage || getAttachmentPreview(attachment),
    lastMessageEncryptedContent: dialog.lastMessageEncryptedContent || dialog.encryptedContent || null
  }, attachment);
}
function makeMessageDialogPayload(msg) {
  const attachment = getMessageAttachment(msg);
  return applyAttachmentFields({
    lastMessage: getPreview(msg),
    lastMessageEncryptedContent: msg.encryptedContent || null,
    createdAt: msg.createdAt
  }, attachment);
}
export default function useDialogs({
  username
} = {}) {
  const [dialogs, setDialogs] = useState([]);
  const [pinnedChats, setPinnedChats] = useState([]);
  const [archivedChats, setArchivedChats] = useState([]);
  const [showArchive, setShowArchive] = useState(false);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const loadPinnedChats = useCallback(async () => {
    try {
      const data = await getPinnedChatsApi();
      setPinnedChats(data.pinnedChats || []);
    } catch (err) {
      // startup/network errors are handled by request guards
    }
  }, []);
  const loadArchivedChats = useCallback(async () => {
    try {
      const data = await getArchivedChatsApi();
      setArchivedChats(data.archivedChats || []);
    } catch (err) {
      // startup/network errors are handled by request guards
    }
  }, []);
  const togglePin = useCallback(async chatKey => {
    try {
      const data = await togglePinnedChatApi(chatKey);
      setPinnedChats(data.pinnedChats || []);
    } catch (err) {
      // startup/network errors are handled by request guards
    }
  }, []);
  const toggleArchive = useCallback(async chatKey => {
    try {
      const data = await toggleArchivedChatApi(chatKey);
      setArchivedChats(data.archivedChats || []);
    } catch (err) {
      // startup/network errors are handled by request guards
    }
  }, []);
  const loadDialogs = useCallback(async () => {
    try {
      const [privateDialogs, groups] = await Promise.all([getDialogs(), getGroupsApi()]);
      setDialogs([...groups.map(normalizeGroup), ...privateDialogs.map(normalizePrivateDialog)]);
    } catch (err) {
      // startup/network errors are handled by request guards
    }
  }, []);
  const addGroup = useCallback(group => {
    setDialogs(prev => {
      const normalized = normalizeGroup(group);
      return [normalized, ...prev.filter(dialog => dialog.chatKey !== normalized.chatKey)];
    });
  }, []);
  const updateGroup = useCallback(group => {
    setDialogs(prev => {
      const normalized = normalizeGroup(group);
      return prev.map(dialog => dialog.chatKey === normalized.chatKey ? {
        ...dialog,
        ...normalized
      } : dialog);
    });
  }, []);
  const updateUserProfile = useCallback(profile => {
    if (!profile?.username) {
      return;
    }
    const targetUsername = profile.username;
    setDialogs(prev => prev.map(dialog => {
      if (dialog.type === "private" && dialog.username === targetUsername) {
        return {
          ...dialog,
          avatar: profile.avatar || "",
          bio: profile.bio || "",
          displayName: profile.displayName || ""
        };
      }
      if (dialog.type === "group") {
        return {
          ...dialog,
          memberUsers: (dialog.memberUsers || []).map(user => user.username === targetUsername ? {
            ...user,
            avatar: profile.avatar || "",
            bio: profile.bio || "",
            displayName: profile.displayName || ""
          } : user)
        };
      }
      return dialog;
    }));
    setSearchResults(prev => prev.map(user => user.username === targetUsername ? {
      ...user,
      avatar: profile.avatar || "",
      bio: profile.bio || "",
      displayName: profile.displayName || ""
    } : user));
  }, []);
  useEffect(() => {
    const query = search.trim();
    if (!query) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const data = await searchUsers(query);
        setSearchResults(data);
      } catch (err) {
        // startup/network errors are handled by request guards
        setSearchResults([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  const updateDialog = useCallback((msg, currentUser) => {
    setDialogs(prev => {
      const payload = makeMessageDialogPayload(msg);
      if (msg.chatType === "group") {
        const chatKey = msg.chatId || `group:${msg.groupId}`;
        const existing = prev.find(dialog => dialog.chatKey === chatKey || dialog.username === chatKey);
        if (!existing) {
          return prev;
        }
        const updated = {
          ...existing,
          title: existing.title || existing.name,
          name: existing.name || existing.title,
          ...payload
        };
        return [updated, ...prev.filter(dialog => dialog.chatKey !== chatKey && dialog.username !== chatKey)];
      }
      const targetUsername = msg.from === currentUser ? msg.to : msg.from;
      const existing = prev.find(dialog => dialog.username === targetUsername);
      if (!existing) {
        return [{
          type: "private",
          chatKey: targetUsername,
          username: targetUsername,
          title: targetUsername,
          name: targetUsername,
          lastSeen: null,
          ...payload
        }, ...prev];
      }
      const updated = {
        ...existing,
        ...payload
      };
      return [updated, ...prev.filter(dialog => dialog.username !== targetUsername)];
    });
  }, []);
  const updateUserLastSeen = useCallback((targetUsername, lastSeen) => {
    setDialogs(prev => prev.map(dialog => dialog.username === targetUsername ? {
      ...dialog,
      lastSeen
    } : dialog));
    setSearchResults(prev => prev.map(user => user.username === targetUsername ? {
      ...user,
      lastSeen
    } : user));
  }, []);
  const removeDialog = useCallback(chatKey => {
    setDialogs(prev => prev.filter(dialog => dialog.chatKey !== chatKey && dialog.username !== chatKey));
    setPinnedChats(prev => prev.filter(item => item !== chatKey));
    setArchivedChats(prev => prev.filter(item => item !== chatKey));
  }, []);
  const deleteGroupDialog = useCallback(async dialog => {
    if (!dialog || dialog.type !== "group" || !dialog.groupId) {
      return;
    }
    try {
      if (dialog.owner === username) {
        await deleteGroupApi(dialog.groupId);
      } else {
        await leaveGroupApi(dialog.groupId);
      }
      const key = dialog.chatKey || `group:${dialog.groupId}`;
      removeDialog(key);
    } catch (err) {
      // startup/network errors are handled by request guards
    }
  }, [username, removeDialog]);
  const filteredDialogs = useMemo(() => {
    if (search.trim()) {
      const privateResults = searchResults.map(user => {
        const existingDialog = dialogs.find(dialog => dialog.username === user.username);
        return {
          type: "private",
          chatKey: user.username,
          username: user.username,
          title: user.username,
          name: user.username,
          avatar: user.avatar || existingDialog?.avatar || "",
          bio: user.bio || existingDialog?.bio || "",
          displayName: user.displayName || existingDialog?.displayName || "",
          lastSeen: user.lastSeen || existingDialog?.lastSeen || null,
          lastMessage: existingDialog?.lastMessage || "",
          attachment: existingDialog?.attachment || null,
          lastMessageAttachment: existingDialog?.lastMessageAttachment || null,
          lastAttachment: existingDialog?.lastAttachment || null,
          lastMessageType: existingDialog?.lastMessageType || "",
          lastAttachmentName: existingDialog?.lastAttachmentName || "",
          lastAttachmentUrl: existingDialog?.lastAttachmentUrl || "",
          createdAt: existingDialog?.createdAt || null
        };
      });
      const groupResults = dialogs.filter(dialog => dialog.type === "group" && (dialog.title || dialog.name || "").toLowerCase().includes(search.trim().toLowerCase()));
      return [...groupResults, ...privateResults];
    }
    return dialogs.filter(dialog => {
      const key = dialog.chatKey || dialog.username;
      const isArchived = archivedChats.includes(key);
      return showArchive ? isArchived : !isArchived;
    });
  }, [dialogs, search, searchResults, archivedChats, showArchive]);
  return {
    dialogs,
    pinnedChats,
    loadPinnedChats,
    togglePin,
    archivedChats,
    loadArchivedChats,
    toggleArchive,
    showArchive,
    setShowArchive,
    search,
    setSearch,
    loadDialogs,
    loadGroups: loadDialogs,
    addGroup,
    updateGroup,
    updateUserProfile,
    updateDialog,
    updateUserLastSeen,
    removeDialog,
    deleteGroupDialog,
    filteredDialogs
  };
}
