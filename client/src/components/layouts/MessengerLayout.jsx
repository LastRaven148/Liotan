import Sidebar
from "../sidebars/Sidebar";

import Chat
from "../chat/Chat";

import ModalsLayer
from "../layers/ModalsLayer";

export default function MessengerLayout({
  app
}) {

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
    loadGroups
  } = app;

  return (
  <div
    className={
      chat.activeChat
        ? "app has-active-chat"
        : "app"
    }
  >

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
  handleKey={chat.handleKey}
  sendMessage={chat.sendMessage}
  sendAttachment={chat.sendAttachment}
  sendAttachments={chat.sendAttachments}
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
        saveBio={saveBio}
        uploadAvatar={uploadAvatar}
        logout={() =>
        logout(socketRef)
        }
        deleteAccount={() =>
        deleteAccount(socketRef)
        }
        createGroupOpen={createGroupOpen}
        setCreateGroupOpen={setCreateGroupOpen}
        onGroupCreated={(group) =>
        addGroup?.(group)
        }
      />

    </div>
  );

}