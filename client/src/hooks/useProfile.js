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
  showToast
}) {

  async function loadProfile(
  user
  ) {
    try {

      const data =
        await getProfile(user);

      setAvatar(
        data.avatar || ""
      );

      setBio(
        data.bio || ""
      );

    } catch (err) {
      console.error(err);
      showToast("Failed to load profile.");
    }
  }

  async function uploadAvatar(
  e
) {

    const file =
      e.target.files[0];

    if (!file) return;

    try {

      const data =
        await uploadAvatarApi(
          username,
          file
        );

      if (data.avatar) {
        setAvatar(
          data.avatar
        );
      }

    } catch (err) {
      console.error(err);
      showToast("Failed to upload avatar.");
    }
  }

  async function saveBio(
  newBio
  ) {

  try {

    await updateBioApi(
      username,
      newBio
    );

    setBio(newBio);

  } catch (err) {

    console.error(err);
    showToast("Failed to save bio.");

  }

}

  return {
    loadProfile,
    uploadAvatar,
    saveBio
  };
}