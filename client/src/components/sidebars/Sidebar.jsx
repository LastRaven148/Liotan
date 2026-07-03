import { useEffect, useRef, useState } from "react";

import useOutsideClick
from "../../hooks/ui/useOutsideClick";

import SidebarHeader from "./SidebarHeader";
import SidebarMenu from "./SidebarMenu";
import DialogList from "./DialogList";
import LiotanIcon from "../common/LiotanIcon";

const createMenuStyle = {
  right: 18,
  left: "auto",
  bottom: 78,
  width: 212,
  maxWidth: "calc(100% - 36px)"
};

const createButtonStyle = {
  right: 18,
  left: "auto",
  bottom: 18,
  width: 52,
  height: 52,
  minWidth: 52,
  minHeight: 52,
  maxWidth: 52,
  maxHeight: 52,
  borderRadius: "50%"
};

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

  useEffect(() => {
    if (!createMenuOpen) {
      return undefined;
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        setCreateMenuOpen(false);
      }
    }

    window.addEventListener("keydown", handleEscape);

    return () =>
      window.removeEventListener("keydown", handleEscape);
  }, [createMenuOpen]);

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
        <div className="sidebar-create-menu" ref={menuRef} style={createMenuStyle}>
          <button
            type="button"
            className="sidebar-create-menu-item"
            onClick={() => {
              setCreateMenuOpen(false);
              openCreateGroup();
            }}
          >
            <span className="sidebar-create-menu-icon" aria-hidden="true">
              <LiotanIcon name="group" size={23} />
            </span>
            Создать группу
          </button>
        </div>
      )}

      <button
        type="button"
        className={createMenuOpen ? "sidebar-create-button active" : "sidebar-create-button"}
        style={createButtonStyle}
        onClick={() => {
          closeProfileMenu();
          setCreateMenuOpen(prev => !prev);
        }}
        aria-label="Создать"
      >
        <LiotanIcon name="edit" size={25} />
      </button>

    </aside>
  );

}