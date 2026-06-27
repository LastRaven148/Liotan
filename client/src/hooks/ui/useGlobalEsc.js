import {
  useEffect
} from "react";

export default function useGlobalEsc({
  profileMenu,
  setProfileMenu,

  showArchive,
  setShowArchive,

  settingsOpen,
  setSettingsOpen,

  profileUser,
  setProfileUser,

  search,
  setSearch,

  activeChat,
  setActiveChat
}) {

  useEffect(() => {

    function handleKeyDown(e) {

      if (e.key !== "Escape") {
        return;
      }

      if (
        document.querySelector(".media-viewer") ||
        document.querySelector(".attachment-preview-overlay") ||
        document.querySelector(".mobile-action-overlay")
      ) {
        return;
      }

      if (profileMenu) {
        setProfileMenu(false);
        return;
      }

      if (search?.trim()) {
        setSearch("");
        return;
      }

      if (showArchive) {
        setShowArchive(false);
        return;
      }

      if (profileUser) {
        setProfileUser(null);
        return;
      }

      if (settingsOpen) {
        setSettingsOpen(false);
        return;
      }

      if (activeChat) {
        setActiveChat(null);
      }

    }

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };

  }, [
    profileMenu,
    showArchive,
    settingsOpen,
    profileUser,
    search,
    activeChat,
    setProfileMenu,
    setShowArchive,
    setSettingsOpen,
    setProfileUser,
    setSearch,
    setActiveChat
  ]);

}