import {
  useCallback
} from "react";

import {
  getProfile,
  uploadAvatarApi,
  updateBioApi
}
from "../services/api";

export default function useProfile({
  username,
  setAvatar,
  setBio,
  setDisplayName,
  showToast
}) {

  const loadProfile =
    useCallback(async user => {
      if (!user) {
        return null;
      }

      try {
        const data =
          await getProfile(user);

        setAvatar(data.avatar || "");
        setBio(data.bio || "");

        setDisplayName?.(
          data.displayName || ""
        );

        return data;
      } catch (err) {
        console.error(err);
        showToast?.("Failed to load profile.");
        return null;
      }
    }, [
      setAvatar,
      setBio,
      setDisplayName,
      showToast
    ]);

  const uploadAvatar =
    useCallback(async fileOrEvent => {
      const file =
        fileOrEvent?.target
          ? fileOrEvent.target.files?.[0]
          : fileOrEvent;

      if (!file) {
        return null;
      }

      try {
        const data =
          await uploadAvatarApi(
            username,
            file
          );

        if (data.avatar) {
          setAvatar(data.avatar);
        }

        if (data.displayName !== undefined) {
          setDisplayName?.(
            data.displayName || ""
          );
        }

        return data;
      } catch (err) {
        console.error(err);
        showToast?.("Failed to upload avatar.");
        return null;
      }
    }, [
      username,
      setAvatar,
      setDisplayName,
      showToast
    ]);

  const saveProfile =
    useCallback(async ({
      bio,
      displayName
    }) => {
      try {
        const data =
          await updateBioApi(
            username,
            bio,
            displayName
          );

        setBio(data.bio || "");

        setDisplayName?.(
          data.displayName || ""
        );

        return data;
      } catch (err) {
        console.error(err);
        showToast?.("Failed to save profile.");
        return null;
      }
    }, [
      username,
      setBio,
      setDisplayName,
      showToast
    ]);

  const saveBio =
    useCallback(async newBio => saveProfile({
      bio: newBio
    }), [
      saveProfile
    ]);

  return {
    loadProfile,
    uploadAvatar,
    saveBio,
    saveProfile
  };

}
