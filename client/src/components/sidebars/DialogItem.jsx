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
  showArchive,
  deleteGroupDialog
}) {

  const { t } =
    useLanguage();

  const [menuOpen, setMenuOpen] =
    useState(false);

  const [confirmDelete, setConfirmDelete] =
    useState(false);

  const menuRef =
    useRef(null);

  const itemRef =
    useRef(null);

  const longPressRef =
    useRef(null);

  const chatKey =
    dialog.chatKey ||
    dialog.username;

  const isGroup =
    dialog.type === "group";

  const unreadCount =
    unread[chatKey] || 0;

  const isSavedMessages =
    dialog.username === username;

  const displayName =
    isGroup
      ? dialog.title ||
        dialog.name ||
        "Группа"
      : isSavedMessages
        ? t.savedMessages
        : dialog.username;

  useEffect(() => {

    function handleEsc(e) {

      if (e.key === "Escape") {
        setMenuOpen(false);
        setConfirmDelete(false);
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
      setConfirmDelete(false);

    }

    window.addEventListener(
      "keydown",
      handleEsc
    );

    document.addEventListener(
      "mousedown",
      handleOutsideClick
    );

    document.addEventListener(
      "touchstart",
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

      document.removeEventListener(
        "touchstart",
        handleOutsideClick
      );

    };

  }, [
    menuOpen
  ]);

  function openMenu(e) {

    e.preventDefault();
    e.stopPropagation();

    setConfirmDelete(false);
    setMenuOpen(true);

  }

  function handleContextMenu(e) {
    openMenu(e);
  }

  function handleTouchStart(e) {

    longPressRef.current =
      setTimeout(() => {
        openMenu(e);
      }, 420);

  }

  function clearLongPress() {

    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }

  }

  function handleOpenChat() {

    if (menuOpen) {
      return;
    }

    openChat(chatKey);

  }

  function handleDelete(e) {

    e.stopPropagation();

    if (isGroup) {
      return;
    }

    setConfirmDelete(true);

  }

  function cancelDelete(e) {

    e.stopPropagation();

    setConfirmDelete(false);

  }

  function confirmDeleteChat(e) {

  e.stopPropagation();

  console.log("DELETE CONFIRM", {
    isGroup,
    dialog,
    deleteGroupDialogExists:
      typeof deleteGroupDialog === "function"
  });

  if (isGroup) {
    if (typeof deleteGroupDialog !== "function") {
      console.error("deleteGroupDialog is not passed");
      return;
    }

    deleteGroupDialog(dialog);
  } else {
    deleteChat(dialog.username);
  }

  setConfirmDelete(false);
  setMenuOpen(false);

}

  function handlePin(e) {

  e.stopPropagation();

  togglePin(chatKey);
  setMenuOpen(false);

}

  function handleArchive(e) {

  e.stopPropagation();

  toggleArchive(chatKey);
  setMenuOpen(false);

}

  return (
    <div
      ref={itemRef}
      className={
        activeChat === chatKey
          ? "user active"
          : "user"
      }
      onClick={handleOpenChat}
      onContextMenu={handleContextMenu}
      onTouchStart={handleTouchStart}
      onTouchEnd={clearLongPress}
      onTouchMove={clearLongPress}
      onTouchCancel={clearLongPress}
    >

      {menuOpen && (
        <div
          ref={menuRef}
          className="dialog-context-menu telegram-action-menu"
          onClick={(e) =>
            e.stopPropagation()
          }
        >

          {confirmDelete ? (
            <div className="dialog-delete-confirm">
              <div className="dialog-delete-title">
                {t.deleteChat || "Удалить чат"}
              </div>

              <div className="dialog-delete-text">
                {isGroup
  ? dialog.owner === username
    ? `Удалить группу ${displayName}?`
    : `Выйти из группы ${displayName}?`
  : isSavedMessages
    ? t.clearSavedMessages || "Очистить избранное?"
    : `${t.deleteChatConfirm || "Удалить чат с"} ${dialog.username}?`}
              </div>

              <div className="dialog-delete-actions">
                <button
                  type="button"
                  onClick={cancelDelete}
                >
                  {t.cancel || "Отмена"}
                </button>

                <button
                  type="button"
                  className="danger"
                  onClick={confirmDeleteChat}
                >
                  {t.delete || "Удалить"}
                </button>
              </div>
            </div>
          ) : (
            <>
              {!isGroup && (
                <>
                  <button
                    type="button"
                    onClick={handlePin}
                  >
                    <span>{isPinned ? "−" : "⌃"}</span>

                    {isPinned
                      ? t.unpinChat
                      : t.pinChat}
                  </button>

                  <button
                    type="button"
                    onClick={handleArchive}
                  >
                    <span>□</span>

                    {isArchived || showArchive
                      ? t.unarchiveChat
                      : t.archiveChat}
                  </button>

                  <button
                    type="button"
                    className="danger"
                    onClick={handleDelete}
                  >
                    <span>×</span>
                    {t.deleteChat}
                  </button>
                </>
              )}

              {isGroup && (
  <>
    <button
      type="button"
      onClick={handlePin}
    >
      <span>{isPinned ? "−" : "⌃"}</span>

      {isPinned
        ? t.unpinChat
        : t.pinChat}
    </button>

    <button
      type="button"
      onClick={handleArchive}
    >
      <span>□</span>

      {isArchived || showArchive
        ? t.unarchiveChat
        : t.archiveChat}
    </button>

    <button
      type="button"
      className="danger"
      onClick={(e) => {
        e.stopPropagation();
        setConfirmDelete(true);
      }}
    >
      <span>×</span>

      {dialog.owner === username
        ? "Удалить группу"
        : "Выйти из группы"}
    </button>
  </>
)}
            </>
          )}

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
          displayName
            ? displayName.charAt(0).toUpperCase()
            : "?"
        )}
      </div>

      <div className="dialog-info">
        <div className="user-name">
          {displayName}

          {isPinned && !isGroup && (
            <span className="dialog-pin">
              ⌃
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
  );

}