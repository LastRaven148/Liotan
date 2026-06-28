import {
  useEffect,
  useRef,
  useState
} from "react";

import { avatarUrl } from "../../utils/avatarUrl";

import {
  useLanguage
} from "../../context/LanguageContext";

import { mediaUrl } from "../../utils/mediaUrl";

function DialogFileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 3.5H14.5L19 8V20.5H7C5.9 20.5 5 19.6 5 18.5V5.5C5 4.4 5.9 3.5 7 3.5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M14 3.8V8.5H18.7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M8.5 13H15.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M8.5 16.5H13"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MusicIcon() {
  return (
    <span className="dialog-audio-icon" aria-hidden="true" />
  );
}

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

  const lastAttachment =
    dialog.lastMessageAttachment ||
    dialog.lastAttachment ||
    dialog.attachment ||
    null;

  const lastAttachmentType =
    lastAttachment?.type ||
    dialog.lastMessageType ||
    dialog.attachmentType ||
    "";

  const lastAttachmentName =
    lastAttachment?.name ||
    dialog.lastAttachmentName ||
    dialog.attachmentName ||
    "";

  const lastAttachmentUrl =
    lastAttachment?.thumbnailUrl ||
    lastAttachment?.previewUrl ||
    lastAttachment?.url ||
    dialog.lastAttachmentThumbnail ||
    dialog.lastAttachmentUrl ||
    "";

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

  function renderPreview() {
    if (lastAttachmentType === "photo") {
      return (
        <div className="dialog-preview dialog-preview-media">
          {lastAttachmentUrl && (
            <img
              src={mediaUrl(lastAttachmentUrl)}
              alt=""
              className="dialog-preview-thumb"
            />
          )}

          <span>Фото</span>
        </div>
      );
    }

    if (lastAttachmentType === "video") {
      return (
        <div className="dialog-preview dialog-preview-media">
          {lastAttachmentUrl && (
            <span className="dialog-preview-video-thumb">
              <video
                src={mediaUrl(lastAttachmentUrl)}
                className="dialog-preview-thumb"
                muted
                playsInline
                preload="metadata"
              />

              <span className="dialog-preview-play" />
            </span>
          )}

          <span>Видео</span>
        </div>
      );
    }

    if (lastAttachmentType === "audio") {
      return (
        <div className="dialog-preview dialog-preview-attachment">
          <MusicIcon />

          <span>
            {lastAttachmentName || "Аудио"}
          </span>
        </div>
      );
    }

    if (lastAttachmentType === "file") {
      return (
        <div className="dialog-preview dialog-preview-attachment">
          <span className="dialog-file-icon">
            <DialogFileIcon />
          </span>

          <span>
            {lastAttachmentName || t.file || "Файл"}
          </span>
        </div>
      );
    }

    return (
      <div className="dialog-preview">
        {dialog.lastMessage || t.noMessages || "No messages yet"}
      </div>
    );
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

        {renderPreview()}
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