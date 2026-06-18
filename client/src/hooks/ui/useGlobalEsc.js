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

  activeChat,
  setActiveChat
}) {

  useEffect(() => {

    function handleKeyDown(e) {

      if (e.key !== "Escape") {
        return;
      }

      if (profileMenu) {
        setProfileMenu(false);
        return;
      }

      if (showArchive) {
        setShowArchive(false);
        return;
      }

      if (settingsOpen) {
        setSettingsOpen(false);
        return;
      }

      if (profileUser) {
        setProfileUser(null);
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
    activeChat,
    setProfileMenu,
    setShowArchive,
    setSettingsOpen,
    setProfileUser,
    setActiveChat
  ]);

}