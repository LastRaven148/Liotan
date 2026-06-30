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

      const modalEscHandledAt =
        window.__liotanModalEscHandledAt || 0;

      if (
        Date.now() - modalEscHandledAt < 250 ||
        document.body.classList.contains("liotan-delete-modal-open") ||
        document.querySelector(".dialog-delete-modal-overlay") ||
        document.querySelector(".message-delete-modal-overlay") ||
        document.querySelector(".media-viewer") ||
        document.querySelector(".attachment-preview-overlay") ||
        document.querySelector(".mobile-action-overlay")
      ) {
        e.preventDefault();
        e.stopPropagation();
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