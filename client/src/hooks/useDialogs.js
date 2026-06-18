import {
  useState,
  useCallback,
  useMemo,
  useEffect
} from "react";

import {
  getDialogs,
  searchUsers,
  getPinnedChatsApi,
  togglePinnedChatApi,
  getArchivedChatsApi,
  toggleArchivedChatApi,
  getGroupsApi
} from "../services/api";

export default function useDialogs() {

  const [dialogs, setDialogs] =
    useState([]);

  const [pinnedChats, setPinnedChats] =
    useState([]);

  const [archivedChats, setArchivedChats] =
    useState([]);

  const [showArchive, setShowArchive] =
    useState(false);

  const [search, setSearch] =
    useState("");

  const [searchResults, setSearchResults] =
    useState([]);

  const loadPinnedChats =
    useCallback(async () => {
      try {
        const data =
          await getPinnedChatsApi();

        setPinnedChats(
          data.pinnedChats || []
        );
      } catch (err) {
        console.error(err);
      }
    }, []);

  const loadArchivedChats =
    useCallback(async () => {
      try {
        const data =
          await getArchivedChatsApi();

        setArchivedChats(
          data.archivedChats || []
        );
      } catch (err) {
        console.error(err);
      }
    }, []);

  const togglePin =
    useCallback(async (chatKey) => {
      try {
        const data =
          await togglePinnedChatApi(chatKey);

        setPinnedChats(
          data.pinnedChats || []
        );
      } catch (err) {
        console.error(err);
      }
    }, []);

  const toggleArchive =
    useCallback(async (chatKey) => {
      try {
        const data =
          await toggleArchivedChatApi(chatKey);

        setArchivedChats(
          data.archivedChats || []
        );
      } catch (err) {
        console.error(err);
      }
    }, []);

  const loadDialogs =
    useCallback(async () => {
      try {
        const [
          privateDialogs,
          groups
        ] =
          await Promise.all([
            getDialogs(),
            getGroupsApi()
          ]);

        const normalizedPrivate =
          privateDialogs.map(dialog => ({
            ...dialog,
            type: "private",
            chatKey: dialog.username,
            title: dialog.username
          }));

        const normalizedGroups =
          groups.map(group => ({
            type: "group",
            groupId: group._id,
            username: `group:${group._id}`,
            chatKey: `group:${group._id}`,
            title: group.name,
            avatar: group.avatar || "",
            lastMessage: "Группа создана",
            createdAt:
              group.updatedAt ||
              group.createdAt,
            members:
              group.members || [],
            owner:
              group.owner,
            admins:
              group.admins || []
          }));

        setDialogs([
          ...normalizedGroups,
          ...normalizedPrivate
        ]);
      } catch (err) {
        console.error(err);
      }
    }, []);

  useEffect(() => {

    const query =
      search.trim();

    if (!query) {
      setSearchResults([]);
      return;
    }

    const timer =
      setTimeout(async () => {
        try {
          const data =
            await searchUsers(query);

          setSearchResults(data);
        } catch (err) {
          console.error(err);
          setSearchResults([]);
        }
      }, 250);

    return () =>
      clearTimeout(timer);

  }, [
    search
  ]);

  const updateDialog =
    useCallback((
      msg,
      currentUser
    ) => {

      function getPreview(msg) {

        if (msg.text) {
          return msg.text;
        }

        if (msg.attachment?.type === "photo") {
          return "Photo";
        }

        if (msg.attachment?.type === "file") {
          return msg.attachment.name || "File";
        }

        return "No messages yet";

      }

      setDialogs(prev => {

        if (msg.chatType === "group") {

          const chatKey =
            msg.chatId ||
            `group:${msg.groupId}`;

          const existing =
            prev.find(
              dialog =>
                dialog.chatKey === chatKey ||
                dialog.username === chatKey
            );

          if (!existing) {
            return prev;
          }

          const updated = {
            ...existing,
            lastMessage: getPreview(msg),
            createdAt: msg.createdAt
          };

          return [
            updated,
            ...prev.filter(
              dialog =>
                dialog.chatKey !== chatKey &&
                dialog.username !== chatKey
            )
          ];
        }

        const targetUsername =
          msg.from === currentUser
            ? msg.to
            : msg.from;

        const existing =
          prev.find(
            dialog =>
              dialog.username === targetUsername
          );

        if (!existing) {
          return [
            {
              type: "private",
              chatKey: targetUsername,
              username: targetUsername,
              title: targetUsername,
              lastMessage: getPreview(msg),
              createdAt: msg.createdAt,
              lastSeen: null
            },
            ...prev
          ];
        }

        const updated = {
          ...existing,
          lastMessage: getPreview(msg),
          createdAt: msg.createdAt
        };

        return [
          updated,
          ...prev.filter(
            dialog =>
              dialog.username !== targetUsername
          )
        ];

      });

    }, []);

  const updateUserLastSeen =
    useCallback((
      targetUsername,
      lastSeen
    ) => {

      setDialogs(prev =>
        prev.map(dialog =>
          dialog.username === targetUsername
            ? {
                ...dialog,
                lastSeen
              }
            : dialog
        )
      );

      setSearchResults(prev =>
        prev.map(user =>
          user.username === targetUsername
            ? {
                ...user,
                lastSeen
              }
            : user
        )
      );

    }, []);

  const removeDialog =
    useCallback((chatKey) => {

      setDialogs(prev =>
        prev.filter(
          dialog =>
            dialog.chatKey !== chatKey &&
            dialog.username !== chatKey
        )
      );

      setPinnedChats(prev =>
        prev.filter(
          item =>
            item !== chatKey
        )
      );

      setArchivedChats(prev =>
        prev.filter(
          item =>
            item !== chatKey
        )
      );

    }, []);

  const filteredDialogs =
    useMemo(() => {

      if (search.trim()) {

        const privateResults =
          searchResults.map(user => {

            const existingDialog =
              dialogs.find(
                dialog =>
                  dialog.username ===
                  user.username
              );

            return {
              type: "private",
              chatKey: user.username,
              username: user.username,
              title: user.username,
              avatar:
                user.avatar ||
                existingDialog?.avatar ||
                "",
              bio:
                user.bio ||
                existingDialog?.bio ||
                "",
              lastSeen:
                user.lastSeen ||
                existingDialog?.lastSeen ||
                null,
              lastMessage:
                existingDialog?.lastMessage ||
                "No messages yet",
              createdAt:
                existingDialog?.createdAt ||
                null
            };

          });

        const groupResults =
          dialogs.filter(dialog =>
            dialog.type === "group" &&
            dialog.title
              ?.toLowerCase()
              .includes(
                search.trim().toLowerCase()
              )
          );

        return [
          ...groupResults,
          ...privateResults
        ];
      }

      return dialogs.filter(dialog => {

        const key =
          dialog.chatKey ||
          dialog.username;

        const isArchived =
          archivedChats.includes(key);

        return showArchive
          ? isArchived
          : !isArchived;

      });

    }, [
      dialogs,
      search,
      searchResults,
      archivedChats,
      showArchive
    ]);

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
    updateDialog,
    updateUserLastSeen,
    removeDialog,

    filteredDialogs
  };

}