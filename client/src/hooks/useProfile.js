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

  async function loadProfile(user) {
    try {
      const data =
        await getProfile(user);

      setAvatar(data.avatar || "");
      setBio(data.bio || "");

      setDisplayName?.(
        data.displayName || ""
      );
    } catch (err) {
      console.error(err);
      showToast("Failed to load profile.");
    }
  }

  async function uploadAvatar(fileOrEvent) {
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
      showToast("Failed to upload avatar.");
      return null;
    }
  }

  async function saveProfile({
    bio,
    displayName
  }) {
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
      showToast("Failed to save profile.");
      return null;
    }
  }

  async function saveBio(newBio) {
    return saveProfile({
      bio: newBio
    });
  }

  return {
    loadProfile,
    uploadAvatar,
    saveBio,
    saveProfile
  };

}