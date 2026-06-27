import { useRef, useState } from "react";
import { API } from "../../config/api";

import useSocket from "../useSocket";
import useProfile from "../useProfile";
import useAuth from "../useAuth";
import useDialogs from "../useDialogs";
import useChat from "../useChat";
import useUI from "../ui/useUI";
import useGlobalEsc from "../ui/useGlobalEsc";
import useAppInitialization
from "./useAppInitialization";

import {
  useToastContext
} from "../../context/ToastContext";

export default function useAppController() {

  const {
    profileMenu,
    setProfileMenu,
    profileUser,
    setProfileUser,
    settingsOpen,
    setSettingsOpen,
    createGroupOpen,
    setCreateGroupOpen
  } = useUI();

  const [avatar, setAvatar] =
    useState("");

  const [bio, setBio] =
    useState("");

  const [chats, setChats] =
    useState({});

  const [onlineUsers, setOnlineUsers] =
    useState([]);

  const [typingUsers, setTypingUsers] =
    useState({});

  const [unread, setUnread] =
    useState({});

  const fileInputRef =
    useRef(null);

  const socketRef =
    useRef(null);

  const [displayName, setDisplayName] =
    useState("");

  const {
    showToast
  } = useToastContext();

  const auth =
    useAuth({
      showToast
    });

  const {
    username,
    token
  } = auth;

  const profile =
    useProfile({
      username,
      setAvatar,
      setBio,
      setDisplayName,
      showToast
    });

  const dialogs =
    useDialogs({
      username
    });

  const chat =
    useChat({
      username,
      socketRef,
      setUnread,
      chats,
      dialogs: dialogs.dialogs
    });

  useGlobalEsc({
    profileMenu,
    setProfileMenu,

    showArchive: dialogs.showArchive,
    setShowArchive: dialogs.setShowArchive,

    settingsOpen,
    setSettingsOpen,

    profileUser,
    setProfileUser,

    activeChat: chat.activeChat,
    setActiveChat: chat.setActiveChat
  });

  useSocket({
  token,
  username,
  activeChat: chat.activeChat,
  setActiveChat: chat.setActiveChat,
  setChats,
  setUnread,
  setOnlineUsers,
  setTypingUsers,
  updateDialog: dialogs.updateDialog,
  updateUserLastSeen: dialogs.updateUserLastSeen,
  updateUserProfile: dialogs.updateUserProfile,
  removeDialog: dialogs.removeDialog,
  updateGroup: dialogs.updateGroup,
  setAvatar,
  setBio,
  setDisplayName,
  setProfileUser,
  socketRef,
  API
});

  useAppInitialization({
    token,
    username,
    loadDialogs: dialogs.loadDialogs,
    loadProfile: profile.loadProfile,
    loadPinnedChats: dialogs.loadPinnedChats,
    loadArchivedChats: dialogs.loadArchivedChats
  });

  async function deleteGroupDialog(dialog) {
    const key =
      dialog?.chatKey ||
      `group:${dialog?.groupId}`;

    await dialogs.deleteGroupDialog(dialog);

    if (chat.activeChat === key) {
      chat.closeChat();
    }
  }

  return {
    API,

    ...auth,

    avatar,
    bio,
    setBio,

    chats,
    onlineUsers,
    typingUsers,
    unread,

    fileInputRef,
    socketRef,

    profileMenu,
    setProfileMenu,

    profileUser,
    setProfileUser,

    settingsOpen,
    setSettingsOpen,

    createGroupOpen,
    setCreateGroupOpen,

    uploadAvatar: profile.uploadAvatar,
    saveBio: profile.saveBio,
    saveProfile: profile.saveProfile,

    dialogs: dialogs.dialogs,

    pinnedChats: dialogs.pinnedChats,
    loadPinnedChats: dialogs.loadPinnedChats,
    togglePin: dialogs.togglePin,

    loadGroups: dialogs.loadGroups,
    addGroup: dialogs.addGroup,
    updateGroup: dialogs.updateGroup,

    archivedChats: dialogs.archivedChats,
    loadArchivedChats: dialogs.loadArchivedChats,
    toggleArchive: dialogs.toggleArchive,
    showArchive: dialogs.showArchive,
    setShowArchive: dialogs.setShowArchive,

    search: dialogs.search,
    setSearch: dialogs.setSearch,
    filteredDialogs: dialogs.filteredDialogs,
    deleteGroupDialog,

    displayName,
    setDisplayName,

    chat
  };
}