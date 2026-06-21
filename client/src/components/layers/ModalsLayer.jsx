import UserProfileModal
from "../modals/UserProfileModal";

import SettingsModal
from "../modals/SettingsModal";

import CreateGroupModal
from "../modals/CreateGroupModal";

export default function ModalsLayer({
  profileUser,
  setProfileUser,
  settingsOpen,
  setSettingsOpen,
  createGroupOpen,
  setCreateGroupOpen,
  username,
  avatar,
  bio,
  saveBio,
  uploadAvatar,
  logout,
  deleteAccount,
  deleteGroupDialog,
  onGroupCreated
}) {

  return (
    <>
      {profileUser && (
        <UserProfileModal
          user={profileUser}
          username={username}
          deleteGroupDialog={deleteGroupDialog}
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

      {createGroupOpen && (
        <CreateGroupModal
          onClose={() =>
            setCreateGroupOpen(false)
          }
          onCreated={onGroupCreated}
        />
      )}
    </>
  );

}