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
  toggleArchivedChatApi
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
    useCallback(async (username) => {
      try {
        const data =
          await togglePinnedChatApi(username);

        setPinnedChats(
          data.pinnedChats || []
        );
      } catch (err) {
        console.error(err);
      }
    }, []);

  const toggleArchive =
    useCallback(async (username) => {
      try {
        const data =
          await toggleArchivedChatApi(username);

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
        const data =
          await getDialogs();

        setDialogs(data);
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

        const username =
          msg.from === currentUser
            ? msg.to
            : msg.from;

        const existing =
          prev.find(
            dialog =>
              dialog.username === username
          );

        if (!existing) {
          return [
            {
              username,
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
              dialog.username !== username
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
    useCallback((username) => {

      setDialogs(prev =>
        prev.filter(
          dialog =>
            dialog.username !== username
        )
      );

      setPinnedChats(prev =>
        prev.filter(
          item =>
            item !== username
        )
      );

      setArchivedChats(prev =>
        prev.filter(
          item =>
            item !== username
        )
      );

    }, []);

  const filteredDialogs =
    useMemo(() => {

      if (search.trim()) {
        return searchResults.map(user => {

          const existingDialog =
            dialogs.find(
              dialog =>
                dialog.username ===
                user.username
            );

          return {
            username: user.username,
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
      }

      return dialogs.filter(dialog => {

        const isArchived =
          archivedChats.includes(
            dialog.username
          );

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