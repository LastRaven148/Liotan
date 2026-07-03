import { useRef, useState } from "react";

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

  const [createMenuOpen, setCreateMenuOpen] =
    useState(false);

  useOutsideClick(
    menuRef,
    () => {
      if (profileMenu) {
        closeProfileMenu();
      }

      if (createMenuOpen) {
        setCreateMenuOpen(false);
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

      {createMenuOpen && (
        <div className="sidebar-create-menu" ref={menuRef}>
          <button
            type="button"
            className="sidebar-create-menu-item"
            onClick={() => {
              setCreateMenuOpen(false);
              openCreateGroup();
            }}
          >
            <span className="sidebar-create-menu-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M8.6 10.8a3.4 3.4 0 1 1 6.8 0 3.4 3.4 0 0 1-6.8 0Z" />
                <path d="M4.2 18.8c.7-3.1 3.4-5.1 7.8-5.1s7.1 2 7.8 5.1" />
                <path d="M4.1 14.6c.45-2 1.95-3.35 4-3.8" />
                <path d="M19.9 14.6c-.45-2-1.95-3.35-4-3.8" />
              </svg>
            </span>
            Создать группу
          </button>
        </div>
      )}

      <button
        type="button"
        className={createMenuOpen ? "sidebar-create-button active" : "sidebar-create-button"}
        onClick={() => {
          closeProfileMenu();
          setCreateMenuOpen(prev => !prev);
        }}
        aria-label="Создать"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4.8 19.2 6 14.6 15.6 5a2.2 2.2 0 0 1 3.1 3.1L9.1 17.7 4.8 19.2Z" />
          <path d="M14.2 6.4 17.3 9.5" />
        </svg>
      </button>

    </aside>
  );

}