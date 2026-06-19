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
  uploadAvatar,
  logout,
  deleteAccount
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
          logout={logout}
          onClose={() =>
            setSettingsOpen(false)
          }
          deleteAccount={deleteAccount}
        />
      )}
    </>
  );

}