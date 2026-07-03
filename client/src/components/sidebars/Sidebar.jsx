import { useRef } from "react";

import useOutsideClick
from "../../hooks/ui/useOutsideClick";

import SidebarHeader from "./SidebarHeader";
import SidebarMenu from "./SidebarMenu";
import DialogList from "./DialogList";

export default function Sidebar({
  username,
  avatar,
  profileMenu,
  setProfileMenu,
  closeProfileMenu,
  openSettings,
  fileInputRef,
  uploadAvatar,
  logout,
  search,
  setSearch,
  dialogs,
  pinnedChats,
  togglePin,
  archivedChats,
  toggleArchive,
  showArchive,
  setShowArchive,
  activeChat,
  openChat,
  deleteChat,
  openCreateGroup,
  deleteGroupDialog,
  unread
}) {

  const menuRef =
    useRef(null);

  useOutsideClick(
    menuRef,
    () => {
      if (profileMenu) {
        closeProfileMenu();
      }
    }
  );

  return (
    <aside className="sidebar">

      <SidebarHeader
        search={search}
        setSearch={setSearch}
        profileMenu={profileMenu}
        setProfileMenu={setProfileMenu}
        showArchive={showArchive}
      />

      {profileMenu && (
        <SidebarMenu
          menuRef={menuRef}
          username={username}
          avatar={avatar}
          fileInputRef={fileInputRef}
          uploadAvatar={uploadAvatar}
          openSettings={openSettings}
          closeProfileMenu={closeProfileMenu}
          logout={logout}
          openChat={openChat}
          showArchive={showArchive}
          setShowArchive={setShowArchive}
        />
      )}

      <DialogList
        dialogs={dialogs}
        pinnedChats={pinnedChats}
        togglePin={togglePin}
        archivedChats={archivedChats}
        toggleArchive={toggleArchive}
        showArchive={showArchive}
        activeChat={activeChat}
        openChat={openChat}
        deleteChat={deleteChat}
        unread={unread}
        username={username}
        deleteGroupDialog={deleteGroupDialog}
      />

      <button
        type="button"
        className="sidebar-create-button"
        onClick={openCreateGroup}
        aria-label="Создать группу"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4.8 19.2 6 14.6 15.6 5a2.2 2.2 0 0 1 3.1 3.1L9.1 17.7 4.8 19.2Z" />
          <path d="M14.2 6.4 17.3 9.5" />
        </svg>
      </button>

    </aside>
  );

}