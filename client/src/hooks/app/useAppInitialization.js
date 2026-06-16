import {
  useEffect
} from "react";

export default function useAppInitialization({
  token,
  username,
  loadDialogs,
  loadProfile,
  loadPinnedChats,
  loadArchivedChats
}) {

  useEffect(() => {

    if (!token || !username) {
      return;
    }

    loadDialogs();
    loadProfile(username);

    if (loadPinnedChats) {
      loadPinnedChats();
    }

    if (loadArchivedChats) {
      loadArchivedChats();
    }

  }, [
    token,
    username
  ]);

}