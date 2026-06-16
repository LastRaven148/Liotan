import UserProfileModal
from "../modals/UserProfileModal";

import SettingsModal
from "../modals/SettingsModal";

export default function ModalsLayer({
  profileUser,
  setProfileUser,
  settingsOpen,
  setSettingsOpen,
  username,
  avatar,
  bio,
  saveBio,
  uploadAvatar
}) {

  return (
    <>
      {profileUser && (
        <UserProfileModal
          user={profileUser}
          onClose={() =>
            setProfileUser(null)
          }
        />
      )}

      {settingsOpen && (
        <SettingsModal
          username={username}
          avatar={avatar}
          bio={bio}
          saveBio={saveBio}
          uploadAvatar={uploadAvatar}
          onClose={() =>
            setSettingsOpen(false)
          }
        />
      )}
    </>
  );

}