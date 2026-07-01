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
  displayName,
  setDisplayName,
  avatar,
  bio,
  saveBio,
  saveProfile,
  uploadAvatar,
  logout,
  deleteAccount,
  deleteGroupDialog,
  updateGroup,
  initialTotpOpen,
  onInitialTotpConsumed,
  onGroupCreated
}) {

  return (
    <>
      {profileUser && (
        <UserProfileModal
          user={profileUser}
          username={username}
          deleteGroupDialog={deleteGroupDialog}
          updateGroup={updateGroup}
          openUserProfile={(user) =>
            setProfileUser(user)
          }
          onClose={() =>
            setProfileUser(null)
          }
        />
      )}

      {settingsOpen && (
        <SettingsModal
          username={username}
          displayName={displayName}
          setDisplayName={setDisplayName}
          avatar={avatar}
          bio={bio}
          saveBio={saveBio}
          saveProfile={saveProfile}
          uploadAvatar={uploadAvatar}
          logout={logout}
          deleteAccount={deleteAccount}
          initialTotpOpen={initialTotpOpen}
          onInitialTotpConsumed={onInitialTotpConsumed}
          onClose={() =>
            setSettingsOpen(false)
          }
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