import {
  useEffect,
  useRef,
  useState
} from "react";

import { avatarUrl } from "../../utils/avatarUrl";

import {
  useLanguage
} from "../../context/LanguageContext";

export default function DialogItem({
  dialog,
  activeChat,
  openChat,
  deleteChat,
  unread,
  username,
  isPinned,
  isArchived,
  togglePin,
  toggleArchive,
  showArchive
}) {

  const { t } =
    useLanguage();

  const [menuOpen, setMenuOpen] =
    useState(false);

  const [deleteModalOpen, setDeleteModalOpen] =
    useState(false);

  const menuRef =
    useRef(null);

  const itemRef =
    useRef(null);

  const unreadCount =
    unread[dialog.username] || 0;

  const isSavedMessages =
    dialog.username === username;

  const displayName =
    isSavedMessages
      ? t.savedMessages
      : dialog.username;

  useEffect(() => {

    function handleEsc(e) {

      if (e.key === "Escape") {
        setMenuOpen(false);
        setDeleteModalOpen(false);
      }

    }

    function handleOutsideClick(e) {

      if (!menuOpen) {
        return;
      }

      if (
        menuRef.current &&
        menuRef.current.contains(e.target)
      ) {
        return;
      }

      if (
        itemRef.current &&
        itemRef.current.contains(e.target)
      ) {
        return;
      }

      setMenuOpen(false);

    }

    window.addEventListener(
      "keydown",
      handleEsc
    );

    document.addEventListener(
      "mousedown",
      handleOutsideClick
    );

    return () => {

      window.removeEventListener(
        "keydown",
        handleEsc
      );

      document.removeEventListener(
        "mousedown",
        handleOutsideClick
      );

    };

  }, [
    menuOpen
  ]);

  function handleContextMenu(e) {

    e.preventDefault();
    e.stopPropagation();

    setMenuOpen(true);

  }

  function handleOpenChat() {

    setMenuOpen(false);
    openChat(dialog.username);

  }

  function handleDelete(e) {

    e.stopPropagation();

    setMenuOpen(false);
    setDeleteModalOpen(true);

  }

  function confirmDelete() {

    deleteChat(dialog.username);
    setDeleteModalOpen(false);

  }

  function handlePin(e) {

    e.stopPropagation();

    togglePin(dialog.username);
    setMenuOpen(false);

  }

  function handleArchive(e) {

    e.stopPropagation();

    toggleArchive(dialog.username);
    setMenuOpen(false);

  }

  return (
    <>
      <div
        ref={itemRef}
        className={
          activeChat === dialog.username
            ? "user active"
            : "user"
        }
        onClick={handleOpenChat}
        onContextMenu={handleContextMenu}
      >

        {menuOpen && (
          <div
            ref={menuRef}
            className="dialog-context-menu"
            onClick={(e) =>
              e.stopPropagation()
            }
          >

            <button
              type="button"
              onClick={handlePin}
            >
              <span>
                {isPinned ? "📌" : "📍"}
              </span>

              {isPinned
                ? t.unpinChat
                : t.pinChat}
            </button>

            <button
              type="button"
              onClick={handleArchive}
            >
              <span>▣</span>

              {isArchived || showArchive
                ? t.unarchiveChat
                : t.archiveChat}
            </button>

            <button
              type="button"
              className="danger"
              onClick={handleDelete}
            >
              <span>🗑</span>
              {t.deleteChat}
            </button>

          </div>
        )}

        <div className="avatar">
          {isSavedMessages ? (
            <div className="saved-icon">
              ★
            </div>
          ) : dialog.avatar ? (
            <img
              src={avatarUrl(dialog.avatar)}
              alt=""
              className="avatar-image"
            />
          ) : (
            dialog.username
              .charAt(0)
              .toUpperCase()
          )}
        </div>

        <div className="dialog-info">
          <div className="user-name">
            {displayName}

            {isPinned && (
              <span className="dialog-pin">
                📌
              </span>
            )}
          </div>

          <div className="dialog-preview">
            {dialog.lastMessage || t.noMessages}
          </div>
        </div>

        <div className="dialog-meta">
          <div className="dialog-time">
            {dialog.createdAt
              ? new Date(dialog.createdAt)
                  .toLocaleTimeString(
                    [],
                    {
                      hour: "2-digit",
                      minute: "2-digit"
                    }
                  )
              : ""}
          </div>

          {unreadCount > 0 && (
            <div className="unread">
              {unreadCount}
            </div>
          )}
        </div>

      </div>

      {deleteModalOpen && (
        <div
          className="modal-overlay"
          onMouseDown={() =>
            setDeleteModalOpen(false)
          }
        >
          <div
            className="confirm-modal"
            onMouseDown={(e) =>
              e.stopPropagation()
            }
          >
            <div className="confirm-title">
              {t.deleteChat}
            </div>

            <div className="confirm-text">
              {isSavedMessages
                ? t.clearSavedMessages
                : `${t.deleteChatConfirm} ${dialog.username}?`}
            </div>

            <div className="confirm-actions">
              <button
                type="button"
                className="confirm-cancel"
                onClick={() =>
                  setDeleteModalOpen(false)
                }
              >
                {t.cancel}
              </button>

              <button
                type="button"
                className="confirm-danger"
                onClick={confirmDelete}
              >
                {t.delete}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

}