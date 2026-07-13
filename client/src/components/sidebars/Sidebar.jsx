import { useEffect, useRef, useState } from "react";

import useOutsideClick
from "../../hooks/ui/useOutsideClick";

import SidebarHeader from "./SidebarHeader";
import SidebarMenu from "./SidebarMenu";
import DialogList from "./DialogList";
import LiotanIcon from "../common/LiotanIcon";

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

  const createRef =
    useRef(null);

  const [createMenuOpen, setCreateMenuOpen] =
    useState(false);

  useOutsideClick(
    menuRef,
    () => {
      if (profileMenu) {
        closeProfileMenu();
      }
    }
  );

  useOutsideClick(
    createRef,
    () => {
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

      <div ref={createRef}>
        {createMenuOpen && (
          <div className="sidebar-create-menu">
            <button
              type="button"
              className="sidebar-create-menu-item"
              onClick={() => {
                setCreateMenuOpen(false);
                openCreateGroup();
              }}
            >
              <span
                aria-hidden="true"
                className="sidebar-create-menu-icon"
              >
                <LiotanIcon name="group" size={23} />
              </span>
              Создать группу
            </button>
          </div>
        )}

        <button
          type="button"
          className={`sidebar-create-button ${createMenuOpen ? "active" : ""}`.trim()}
          onClick={() => {
            closeProfileMenu();
            setCreateMenuOpen(prev => !prev);
          }}
          aria-label="Создать"
        >
          <LiotanIcon name="edit" size={27} />
        </button>
      </div>

    </aside>
  );

}
