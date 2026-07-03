import { useEffect, useRef, useState } from "react";

import useOutsideClick
from "../../hooks/ui/useOutsideClick";

import SidebarHeader from "./SidebarHeader";
import SidebarMenu from "./SidebarMenu";
import DialogList from "./DialogList";
import LiotanIcon from "../common/LiotanIcon";

const createMenuStyle = {
  position: "absolute",
  right: 18,
  left: "auto",
  bottom: 82,
  width: 224,
  maxWidth: "calc(100% - 36px)",
  padding: 7,
  border: "1px solid rgba(255,255,255,.06)",
  borderRadius: 14,
  background: "#17212b",
  boxShadow: "0 16px 38px rgba(0,0,0,.42)",
  boxSizing: "border-box",
  zIndex: 80
};

const createMenuItemStyle = {
  width: "100%",
  height: 44,
  border: 0,
  borderRadius: 10,
  background: "transparent",
  color: "#e6edf5",
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "0 12px",
  fontFamily: "inherit",
  fontSize: 14,
  fontWeight: 500,
  textAlign: "left",
  cursor: "pointer"
};

const createButtonStyle = {
  position: "absolute",
  right: 18,
  left: "auto",
  bottom: 18,
  width: 56,
  height: 56,
  minWidth: 56,
  minHeight: 56,
  maxWidth: 56,
  maxHeight: 56,
  border: 0,
  borderRadius: "50%",
  background: "#8774e1",
  color: "#ffffff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "0 8px 22px rgba(0,0,0,.34)",
  cursor: "pointer",
  zIndex: 81,
  boxSizing: "border-box"
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
          <div style={createMenuStyle}>
            <button
              type="button"
              style={createMenuItemStyle}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#223142";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
              onClick={() => {
                setCreateMenuOpen(false);
                openCreateGroup();
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 24,
                  minWidth: 24,
                  height: 24,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#d7dde5"
                }}
              >
                <LiotanIcon name="group" size={23} />
              </span>
              Создать группу
            </button>
          </div>
        )}

        <button
          type="button"
          style={createButtonStyle}
          onMouseEnter={(e) => {
            e.currentTarget.style.filter = "brightness(1.08)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.filter = "none";
          }}
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