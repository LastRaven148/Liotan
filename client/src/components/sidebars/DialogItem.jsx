import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { avatarUrl } from "../../utils/avatarUrl";
import { useLanguage } from "../../context/LanguageContext";
import { mediaUrl } from "../../utils/mediaUrl";
function DialogMenuIcon({
  name
}) {
  const common = {
    width: "18",
    height: "18",
    viewBox: "0 0 24 24",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    "aria-hidden": "true"
  };
  switch (name) {
    case "pin":
      return <svg {...common}>
          <path d="M15.5 4.5L19.5 8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M14.8 5.2L9.8 10.2L7 10.6L6.2 11.4L12.6 17.8L13.4 17L13.8 14.2L18.8 9.2L14.8 5.2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M10.5 15.5L5 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>;
    case "unpin":
      return <svg {...common}>
          <path d="M15.5 4.5L19.5 8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M14.8 5.2L9.8 10.2L7 10.6L6.2 11.4L12.6 17.8L13.4 17L13.8 14.2L18.8 9.2L14.8 5.2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M10.5 15.5L5 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M4 4L20 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>;
    case "archive":
      return <svg {...common}>
          <path d="M5 8H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M7 8L8 20H16L17 8" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M6 4H18L19 8H5L6 4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M12 11V16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M9.5 13.5L12 16L14.5 13.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>;
    case "unarchive":
      return <svg {...common}>
          <path d="M5 8H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M7 8L8 20H16L17 8" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M6 4H18L19 8H5L6 4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M12 17V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M9.5 14.5L12 12L14.5 14.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>;
    case "delete":
      return <svg {...common}>
          <path d="M5 7H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M10 11V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M14 11V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M8 7L8.7 19C8.8 20.1 9.7 21 10.8 21H13.2C14.3 21 15.2 20.1 15.3 19L16 7" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M9.5 7V5.5C9.5 4.7 10.2 4 11 4H13C13.8 4 14.5 4.7 14.5 5.5V7" stroke="currentColor" strokeWidth="2" />
        </svg>;
    default:
      return null;
  }
}
function DialogIconSlot({
  name
}) {
  return <span className="menu-icon" aria-hidden="true">
      <DialogMenuIcon name={name} />
    </span>;
}
function isEncryptedPreviewText(value) {
  if (typeof value !== "string") {
    return false;
  }
  return value.startsWith("__LIOTAN_E2EE_") || value.startsWith("__LIOTAN_VOICE_");
}
function getSafePreviewText(value, fallback = "Сообщение") {
  if (isEncryptedPreviewText(value)) {
    return fallback;
  }
  return value || "";
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
  const {
    t
  } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteForEveryone, setDeleteForEveryone] = useState(false);
  const menuRef = useRef(null);
  const itemRef = useRef(null);
  const longPressRef = useRef(null);
  const dialogsScrollTopRef = useRef(null);
  const chatScrollSnapshotRef = useRef(null);
  const chatKey = dialog.chatKey || dialog.username;
  const isGroup = dialog.type === "group";
  const unreadCount = unread[chatKey] || 0;
  const isSavedMessages = dialog.username === username;
  const displayName = isGroup ? dialog.title || dialog.name || "Группа" : isSavedMessages ? t.savedMessages : dialog.displayName?.trim() || dialog.name?.trim() || dialog.title?.trim() || dialog.username;
  const lastAttachment = dialog.lastMessageAttachment || dialog.lastAttachment || dialog.attachment || null;
  const lastAttachmentType = lastAttachment?.type || dialog.lastMessageType || dialog.attachmentType || "";
  const lastAttachmentName = lastAttachment?.name || dialog.lastAttachmentName || dialog.attachmentName || "";
  const lastAttachmentUrl = lastAttachment?.thumbnailUrl || lastAttachment?.previewUrl || lastAttachment?.url || dialog.lastAttachmentThumbnail || dialog.lastAttachmentUrl || "";
  const rememberDialogsScroll = useCallback(() => {
    const dialogsList = itemRef.current?.closest?.(".dialogs-list");
    if (dialogsList) {
      dialogsScrollTopRef.current = dialogsList.scrollTop;
    }
  }, []);
  const restoreDialogsScroll = useCallback(() => {
    const scrollTop = dialogsScrollTopRef.current;
    if (typeof scrollTop !== "number") {
      return;
    }
    requestAnimationFrame(() => {
      const dialogsList = itemRef.current?.closest?.(".dialogs-list") || document.querySelector(".dialogs-list");
      if (dialogsList) {
        dialogsList.scrollTop = scrollTop;
      }
    });
  }, []);
  const rememberChatScroll = useCallback(() => {
    const messages = document.querySelector(".messages");
    if (!messages) {
      chatScrollSnapshotRef.current = null;
      return;
    }
    chatScrollSnapshotRef.current = {
      top: messages.scrollTop,
      height: messages.scrollHeight
    };
  }, []);
  const restoreChatScroll = useCallback(() => {
    const snapshot = chatScrollSnapshotRef.current;
    if (!snapshot) {
      return;
    }
    const apply = () => {
      const messages = document.querySelector(".messages");
      if (!messages) {
        return;
      }
      const heightDiff = messages.scrollHeight - snapshot.height;
      messages.scrollTop = snapshot.top + heightDiff;
    };
    apply();
    requestAnimationFrame(apply);
    setTimeout(apply, 80);
    setTimeout(apply, 250);
  }, []);
  const closeDeleteConfirm = useCallback(() => {
    window.__liotanModalEscHandledAt = Date.now();
    setConfirmDelete(false);
    setDeleteForEveryone(false);
    restoreDialogsScroll();
    restoreChatScroll();
  }, [restoreDialogsScroll, restoreChatScroll]);
  useEffect(() => {
    if (!confirmDelete) {
      document.body.classList.remove("liotan-delete-modal-open");
      return undefined;
    }
    document.body.classList.add("liotan-delete-modal-open");
    return () => {
      document.body.classList.remove("liotan-delete-modal-open");
    };
  }, [confirmDelete]);
  useEffect(() => {
    function handleEsc(e) {
      if (e.key !== "Escape") {
        return;
      }
      if (confirmDelete) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation?.();
        window.__liotanModalEscHandledAt = Date.now();
        rememberChatScroll();
        closeDeleteConfirm();
        return;
      }
      if (menuOpen) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation?.();
        setMenuOpen(false);
      }
    }
    function handleOutsideClick(e) {
      if (!menuOpen) {
        return;
      }
      if (menuRef.current && menuRef.current.contains(e.target)) {
        return;
      }
      if (itemRef.current && itemRef.current.contains(e.target)) {
        return;
      }
      setMenuOpen(false);
      closeDeleteConfirm();
    }
    window.addEventListener("keydown", handleEsc, true);
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("touchstart", handleOutsideClick);
    return () => {
      window.removeEventListener("keydown", handleEsc, true);
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
    };
  }, [menuOpen, confirmDelete, closeDeleteConfirm, rememberChatScroll]);
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
    longPressRef.current = setTimeout(() => {
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
    rememberDialogsScroll();
    rememberChatScroll();
    setDeleteForEveryone(false);
    setConfirmDelete(true);
    setMenuOpen(false);
  }
  function cancelDelete(e) {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    closeDeleteConfirm();
  }
  function confirmDeleteChat(e) {
    e.stopPropagation();
    rememberChatScroll();
    if (isGroup) {
      if (typeof deleteGroupDialog !== "function") {
        console.error("deleteGroupDialog is not passed");
        return;
      }
      deleteGroupDialog(dialog);
    } else {
      deleteChat(dialog.username, {
        forEveryone: deleteForEveryone
      });
    }
    setConfirmDelete(false);
    setDeleteForEveryone(false);
    setMenuOpen(false);
    restoreDialogsScroll();
    restoreChatScroll();
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
      return <div className="dialog-preview dialog-preview-media">
        {lastAttachmentUrl && <img src={mediaUrl(lastAttachmentUrl)} alt="" className="dialog-preview-thumb" />}

        <span>{t.photo || "Фото"}</span>
      </div>;
    }
    if (lastAttachmentType === "video") {
      return <div className="dialog-preview dialog-preview-media">
        {lastAttachmentUrl && <span className="dialog-preview-video-thumb">
            <video src={mediaUrl(lastAttachmentUrl)} className="dialog-preview-thumb" muted playsInline preload="metadata" />

            <span className="dialog-preview-play" />
          </span>}

        <span>{t.video || "Видео"}</span>
      </div>;
    }
    if (lastAttachmentType === "voice") {
      return <div className="dialog-preview dialog-preview-attachment">
        <span>{t.voiceMessage || "Голосовое сообщение"}</span>
      </div>;
    }
    if (lastAttachmentType === "audio") {
      return <div className="dialog-preview dialog-preview-attachment">
  <span>
    {lastAttachmentName || getSafePreviewText(dialog.lastMessage, t.audio || "Аудио") || t.audio || "Аудио"}
  </span>
</div>;
    }
    if (lastAttachmentType === "file") {
      return <div className="dialog-preview dialog-preview-attachment">
        <span>
          {lastAttachmentName || t.file || "Файл"}
        </span>
      </div>;
    }
    return <div className="dialog-preview">
      {getSafePreviewText(dialog.lastMessage)}
    </div>;
  }
  return <div ref={itemRef} className={activeChat === chatKey ? "user active" : "user"} onClick={handleOpenChat} onContextMenu={handleContextMenu} onTouchStart={handleTouchStart} onTouchEnd={clearLongPress} onTouchMove={clearLongPress} onTouchCancel={clearLongPress}>

      {menuOpen && <div ref={menuRef} className="dialog-context-menu telegram-action-menu" onClick={e => e.stopPropagation()}>

          <>
              {!isGroup && <>
                  <button type="button" onClick={handlePin}>
                    <DialogIconSlot name={isPinned ? "unpin" : "pin"} />

                    {isPinned ? t.unpinChat : t.pinChat}
                  </button>

                  <button type="button" onClick={handleArchive}>
                    <DialogIconSlot name={isArchived || showArchive ? "unarchive" : "archive"} />

                    {isArchived || showArchive ? t.unarchiveChat : t.archiveChat}
                  </button>

                  <button type="button" className="danger" onClick={handleDelete}>
                    <DialogIconSlot name="delete" />
                    {t.deleteChat}
                  </button>
                </>}

              {isGroup && <>
                  <button type="button" onClick={handlePin}>
                    <DialogIconSlot name={isPinned ? "unpin" : "pin"} />

                    {isPinned ? t.unpinChat : t.pinChat}
                  </button>

                  <button type="button" onClick={handleArchive}>
                    <DialogIconSlot name={isArchived || showArchive ? "unarchive" : "archive"} />

                    {isArchived || showArchive ? t.unarchiveChat : t.archiveChat}
                  </button>

                  <button type="button" className="danger" onClick={e => {
            e.stopPropagation();
            rememberDialogsScroll();
            rememberChatScroll();
            setDeleteForEveryone(false);
            setConfirmDelete(true);
            setMenuOpen(false);
          }}>
                    <DialogIconSlot name="delete" />

                    {dialog.owner === username ? t.deleteGroup || "Удалить группу" : t.leaveGroup || "Выйти из группы"}
                  </button>
                </>}
</>

        </div>}

      {confirmDelete && createPortal(<div className="dialog-delete-modal-overlay" onClick={cancelDelete}>
          <div className="dialog-delete-modal" onClick={e => e.stopPropagation()}>
            <div className="dialog-delete-modal-title">
              {isGroup ? dialog.owner === username ? t.deleteGroup || "Удалить группу" : t.leaveGroup || "Выйти из группы" : t.deleteChat || "Удалить чат"}
            </div>

            <div className="dialog-delete-modal-text">
              {isGroup ? dialog.owner === username ? `${t.confirmDeleteGroup || "Вы точно хотите удалить группу"} ${displayName}?` : `${t.confirmLeaveGroup || "Вы точно хотите выйти из группы"} ${displayName}?` : `${t.deleteChatConfirm || "Удалить чат с"} ${displayName}?`}
            </div>

            {!isGroup && !isSavedMessages && <label className="dialog-delete-checkbox-row">
                <span className="dialog-delete-checkbox">
                  <input type="checkbox" checked={deleteForEveryone} onChange={e => setDeleteForEveryone(e.target.checked)} />

                  <span className="dialog-delete-checkbox-box" />
                </span>

                <span>
                  {t.alsoDeleteFor || "Также удалить для"} {displayName}
                </span>
              </label>}

            <div className="dialog-delete-modal-actions">
              <button type="button" className="dialog-delete-modal-cancel" onClick={cancelDelete}>
                {t.cancel || "Отмена"}
              </button>

              <button type="button" className="dialog-delete-modal-danger" onClick={confirmDeleteChat}>
                {isGroup ? dialog.owner === username ? t.delete || "Удалить" : t.logout || "Выйти" : t.deleteChat || "Удалить чат"}
              </button>
            </div>
          </div>
        </div>, document.body)}

      <div className="avatar">
        {isSavedMessages ? <div className="saved-icon">
            
          </div> : dialog.avatar ? <img src={avatarUrl(dialog.avatar)} alt="" className="avatar-image" /> : displayName ? displayName.charAt(0).toUpperCase() : "?"}
      </div>

      <div className="dialog-info">
        <div className="user-name">
          {displayName}

          {isPinned && !isGroup && <span className="dialog-pin">
              ⌃
            </span>}
        </div>

        {renderPreview()}
      </div>

      <div className="dialog-meta">
        <div className="dialog-time">
          {dialog.createdAt ? new Date(dialog.createdAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit"
        }) : ""}
        </div>

        {unreadCount > 0 && <div className="unread">
            {unreadCount}
          </div>}
      </div>

    </div>;
}
