import { useEffect, useState }
from "react";

import Sidebar
from "../sidebars/Sidebar";

import Chat
from "../chat/Chat";

import ModalsLayer
from "../layers/ModalsLayer";

import AudioPlayer
from "../chat/AudioPlayer";

import useViewportMode
from "../../hooks/ui/useViewportMode";

export default function MessengerLayout({
  app
}) {

  const viewportMode =
    useViewportMode();

  const [autoOpenTotp, setAutoOpenTotp] =
    useState(false);

  const {
    username,
    avatar,
    fileInputRef,
    profileMenu,
    setProfileMenu,
    search,
    setSearch,
    filteredDialogs,
    pinnedChats,
    togglePin,
    archivedChats,
    toggleArchive,
    showArchive,
    setShowArchive,
    unread,
    chat,
    onlineUsers,
    typingUsers,
    uploadAvatar,
    logout,
    socketRef,
    setSettingsOpen,
    setProfileUser,
    profileUser,
    settingsOpen,
    bio,
    saveBio,
    deleteAccount,
    createGroupOpen,
    setCreateGroupOpen,
    addGroup,
    updateGroup,
    displayName,
    setDisplayName,
    saveProfile,
    deleteGroupDialog
  } = app;

  useEffect(() => {
    if (localStorage.getItem("liotan-open-totp-setup") !== "1") {
      return;
    }

    localStorage.removeItem("liotan-open-totp-setup");
    setAutoOpenTotp(true);
    setSettingsOpen(true);
  }, [setSettingsOpen]);

  return (
    <div
      className={[
        "app",
        `app--${viewportMode}`,
        chat.activeChat ? "has-active-chat" : "",
        profileUser ? "has-profile-drawer" : ""
      ].join(" ")}
    >
      <AudioPlayer />
      <Sidebar
        username={username}
        avatar={avatar}
        profileMenu={profileMenu}
        setProfileMenu={setProfileMenu}
        fileInputRef={fileInputRef}
        uploadAvatar={uploadAvatar}
        logout={() =>
          logout(socketRef)
        }
        search={search}
        setSearch={setSearch}
        dialogs={filteredDialogs}
        pinnedChats={pinnedChats}
        togglePin={togglePin}
        archivedChats={archivedChats}
        toggleArchive={toggleArchive}
        showArchive={showArchive}
        setShowArchive={setShowArchive}
        activeChat={chat.activeChat}
        openChat={chat.openChat}
        deleteChat={chat.deleteChat}
        unread={unread}
        deleteGroupDialog={deleteGroupDialog}
        closeProfileMenu={() =>
          setProfileMenu(false)
        }
        openSettings={() =>
          setSettingsOpen(true)
        }
        openCreateGroup={() =>
          setCreateGroupOpen(true)
        }
      />

      <Chat
        activeChat={chat.activeChat}
        activeDialog={chat.activeDialog}
        onlineUsers={onlineUsers}
        typingUsers={typingUsers}
        messages={chat.messages}
        username={username}
        text={chat.text}
        setText={chat.setText}
        editingMessage={chat.editingMessage}
        cancelEditMessage={chat.cancelEditMessage}
        startEditMessage={chat.startEditMessage}
        replyMessage={chat.replyMessage}
        startReplyMessage={chat.startReplyMessage}
        cancelReplyMessage={chat.cancelReplyMessage}
        deleteMessage={chat.deleteMessage}
        pinMessage={chat.pinMessage}
        handleKey={chat.handleKey}
        sendMessage={chat.sendMessage}
        sendAttachment={chat.sendAttachment}
        sendAttachments={chat.sendAttachments}
        sendVoiceMessage={chat.sendVoiceMessage}
        openProfile={() =>
          setProfileUser(chat.activeDialog)
        }
        onBack={chat.closeChat}
      />

      <ModalsLayer
        profileUser={profileUser}
        setProfileUser={setProfileUser}
        settingsOpen={settingsOpen}
        setSettingsOpen={setSettingsOpen}
        username={username}
        avatar={avatar}
        bio={bio}
        displayName={displayName}
        setDisplayName={setDisplayName}
        saveBio={saveBio}
        saveProfile={saveProfile}
        uploadAvatar={uploadAvatar}
        logout={() =>
          logout(socketRef)
        }
        deleteAccount={(reauth) =>
          deleteAccount(socketRef, reauth)
        }
        deleteGroupDialog={deleteGroupDialog}
        updateGroup={updateGroup}
        createGroupOpen={createGroupOpen}
        setCreateGroupOpen={setCreateGroupOpen}
        initialTotpOpen={autoOpenTotp}
        onInitialTotpConsumed={() =>
          setAutoOpenTotp(false)
        }
        onGroupCreated={(group) =>
          addGroup?.(group)
        }
      />
    </div>
  );

}
