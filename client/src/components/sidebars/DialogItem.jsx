import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { avatarUrl } from "../../utils/avatarUrl";
import { useLanguage } from "../../context/LanguageContext";
import { mediaUrl } from "../../utils/mediaUrl";
import { formatTime } from "../../utils/date";
import useTimeFormat from "../../hooks/ui/useTimeFormat";
import LiotanIcon from "../common/LiotanIcon";
import { decryptAttachmentBlobForChat, decryptTextForChat, getEffectiveE2EEChatKey, isEncryptedAttachment } from "../../utils/e2ee";
import { downloadMlsCiphertext } from "../../crypto/mlsEngine";
function DialogMenuIcon({ name }) {
  const iconName = name === "delete" ? "trash" : name;
  return <LiotanIcon name={iconName} size={21} />;
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
  const timeFormat = useTimeFormat();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const menuRef = useRef(null);
  const itemRef = useRef(null);
  const longPressRef = useRef(null);
  const dialogsScrollTopRef = useRef(null);
  const chatScrollSnapshotRef = useRef(null);
  const deleteModalRef = useRef(null);
  const deletePreviousFocusRef = useRef(null);
  const deleteTitleId = useId();
  const chatKey = dialog.chatKey || dialog.username;
  const isGroup = dialog.type === "group";
  const unreadCount = unread[chatKey] || 0;
  const isSavedMessages = dialog.username === username;
  const displayName = isGroup ? dialog.title || dialog.name || "Группа" : isSavedMessages ? t.savedMessages : dialog.displayName?.trim() || dialog.name?.trim() || dialog.title?.trim() || dialog.username;
  const lastAttachment = dialog.lastMessageAttachment || dialog.lastAttachment || dialog.attachment || null;
  const lastAttachmentType = lastAttachment?.type || dialog.lastMessageType || dialog.attachmentType || "";
  const lastAttachmentName = lastAttachment?.name || dialog.lastAttachmentName || dialog.attachmentName || "";
  const lastAttachmentUrl = lastAttachment?.thumbnailUrl || lastAttachment?.previewUrl || lastAttachment?.url || dialog.lastAttachmentThumbnail || dialog.lastAttachmentUrl || "";
  const [decryptedPreviewUrl, setDecryptedPreviewUrl] = useState("");
  const [decryptedPreviewText, setDecryptedPreviewText] = useState("");
  const encryptedPreview = isEncryptedAttachment(lastAttachment) ||
    String(lastAttachmentUrl).startsWith("/crypto/v4/media/");
  const previewUrl = encryptedPreview ? decryptedPreviewUrl : (decryptedPreviewUrl || lastAttachmentUrl);


  useEffect(() => {
    let alive = true;
    let timer = null;
    const hasEncryptedPreview = Boolean(dialog?.lastMessageEncryptedContent?.ciphertext || isEncryptedPreviewText(dialog.lastMessage));
    const effectiveChatKey = getEffectiveE2EEChatKey(chatKey, dialog);
    const encryptedContent = dialog.lastMessageEncryptedContent || null;
    const encryptedText = isEncryptedPreviewText(dialog.lastMessage) ? dialog.lastMessage : "";

    async function loadEncryptedTextPreview() {
      if (!hasEncryptedPreview) {
        if (alive) setDecryptedPreviewText("");
        return;
      }

      try {
        const value = await decryptTextForChat({
          username,
          chatKey: effectiveChatKey,
          text: encryptedText,
          encryptedContent
        });
        if (!alive) {
          return;
        }
        if (value && !isEncryptedPreviewText(value) && !value.startsWith("Зашифрованное сообщение") && !value.startsWith("Не удалось")) {
          setDecryptedPreviewText(previous => previous === value ? previous : value);
        }
      } catch {
        if (alive) setDecryptedPreviewText("");
      }
    }

    function schedulePreviewReload(event) {
      const detail = event?.detail || {};
      if (detail.username && detail.username !== username) {
        return;
      }
      if (detail.chatKey && detail.chatKey !== effectiveChatKey && detail.chatKey !== chatKey) {
        return;
      }
      window.clearTimeout(timer);
      timer = window.setTimeout(loadEncryptedTextPreview, 80);
    }

    loadEncryptedTextPreview();
    window.addEventListener("liotan:e2ee-updated", schedulePreviewReload);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      window.removeEventListener("liotan:e2ee-updated", schedulePreviewReload);
    };
  }, [dialog?.lastMessage, dialog?.lastMessageEncryptedContent, dialog?.e2eeVersion, username, chatKey]);

  useEffect(() => {
    let alive = true;
    let objectUrl = "";

    async function loadEncryptedPreview() {
      setDecryptedPreviewUrl("");
      if (!lastAttachment || !lastAttachmentUrl || !isEncryptedAttachment(lastAttachment)) {
        return;
      }
      if (lastAttachmentType !== "photo" && lastAttachmentType !== "video") {
        return;
      }

      try {
        const blob = lastAttachment?.mlsMedia?.v === 1
          ? await downloadMlsCiphertext(lastAttachment)
          : await fetch(mediaUrl(lastAttachmentUrl), { credentials: "include" }).then(response => {
              if (!response.ok) throw new Error("Encrypted preview download failed");
              return response.blob();
            });
        const decrypted = await decryptAttachmentBlobForChat({
          username,
          chatKey: getEffectiveE2EEChatKey(chatKey, dialog),
          attachment: lastAttachment,
          blob
        });
        if (!alive) return;
        objectUrl = URL.createObjectURL(decrypted);
        setDecryptedPreviewUrl(objectUrl);
      } catch {
        if (alive) setDecryptedPreviewUrl("");
      }
    }

    loadEncryptedPreview();

    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [lastAttachment, lastAttachmentUrl, lastAttachmentType, username, chatKey, dialog]);
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
    requestAnimationFrame(() => requestAnimationFrame(apply));
  }, []);
  const closeDeleteConfirm = useCallback(() => {
    window.__liotanModalEscHandledAt = Date.now();
    setConfirmDelete(false);
    restoreDialogsScroll();
    restoreChatScroll();
  }, [restoreDialogsScroll, restoreChatScroll]);
  useEffect(() => {
    if (!confirmDelete) {
      document.body.classList.remove("liotan-delete-modal-open");
      return undefined;
    }
    document.body.classList.add("liotan-delete-modal-open");
    deletePreviousFocusRef.current = document.activeElement;
    const frame = requestAnimationFrame(() => {
      deleteModalRef.current?.querySelector(".dialog-delete-modal-cancel")?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
      document.body.classList.remove("liotan-delete-modal-open");
      deletePreviousFocusRef.current?.focus?.();
      deletePreviousFocusRef.current = null;
    };
  }, [confirmDelete]);
  useEffect(() => {
    function handleEsc(e) {
      if (e.key === "Tab" && confirmDelete && deleteModalRef.current) {
        const focusable = [...deleteModalRef.current.querySelectorAll("button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex=\"-1\"])")]
          .filter(item => item.getClientRects().length > 0);
        if (focusable.length) {
          const first = focusable[0];
          const last = focusable.at(-1);
          if (e.shiftKey && (document.activeElement === first || !deleteModalRef.current.contains(document.activeElement))) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
        return;
      }
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
        if (import.meta.env.DEV) console.warn("deleteGroupDialog is not passed");
        return;
      }
      deleteGroupDialog(dialog);
    } else {
      deleteChat(dialog.username);
    }
    setConfirmDelete(false);
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
        {previewUrl && <span className="dialog-preview-photo-thumb">
            <img src={previewUrl.startsWith("blob:") ? previewUrl : mediaUrl(previewUrl)} alt="" className="dialog-preview-thumb" loading="lazy" />
          </span>}

        <span>{t.photo || "Фото"}</span>
      </div>;
    }
    if (lastAttachmentType === "video") {
      return <div className="dialog-preview dialog-preview-media">
        {previewUrl && <span className="dialog-preview-video-thumb">
            <video src={previewUrl.startsWith("blob:") ? previewUrl : mediaUrl(previewUrl)} className="dialog-preview-thumb" muted playsInline preload="metadata" />

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
    const fallbackPreview = getSafePreviewText(dialog.lastMessage);
    const previewText = decryptedPreviewText || (fallbackPreview === "Encrypted message" ? t.encryptedMessage || "Зашифрованное сообщение" : fallbackPreview);
    return <div className="dialog-preview">
      {previewText}
    </div>;
  }
  return <div ref={itemRef} className={activeChat === chatKey ? "user active" : "user"} onClick={handleOpenChat} onContextMenu={handleContextMenu} onTouchStart={handleTouchStart} onTouchEnd={clearLongPress} onTouchMove={clearLongPress} onTouchCancel={clearLongPress}>

      {menuOpen && <div ref={menuRef} className="dialog-context-menu telegram-action-menu" onClick={e => e.stopPropagation()}>

          <>
              {!isGroup && <>
                  <button type="button" onClick={e => {
                    e.stopPropagation();
                    setMenuOpen(false);
                  }}>
                    <DialogIconSlot name="openTab" />
                    {t.openInNewTab || "Открыть в новой вкладке"}
                  </button>

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
                  <button type="button" onClick={e => {
                    e.stopPropagation();
                    setMenuOpen(false);
                  }}>
                    <DialogIconSlot name="openTab" />
                    {t.openInNewTab || "Открыть в новой вкладке"}
                  </button>

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
          <div ref={deleteModalRef} className="dialog-delete-modal" role="dialog" aria-modal="true" aria-labelledby={deleteTitleId} onClick={e => e.stopPropagation()}>
            <div className="dialog-delete-modal-title" id={deleteTitleId}>
              {isGroup ? dialog.owner === username ? t.deleteGroup || "Удалить группу" : t.leaveGroup || "Выйти из группы" : t.deleteChat || "Удалить чат"}
            </div>

            <div className="dialog-delete-modal-text">
              {isGroup ? dialog.owner === username ? `${t.confirmDeleteGroup || "Вы точно хотите удалить группу"} ${displayName}?` : `${t.confirmLeaveGroup || "Вы точно хотите выйти из группы"} ${displayName}?` : `Чат с ${displayName} будет безвозвратно удалён у всех участников и на всех их устройствах.`}
            </div>

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
        {isSavedMessages ? <div className="saved-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 3.6L14.45 8.55L19.9 9.35L15.95 13.2L16.9 18.65L12 16.08L7.1 18.65L8.05 13.2L4.1 9.35L9.55 8.55L12 3.6Z" fill="currentColor"/>
            </svg>
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
          {dialog.createdAt ? formatTime(dialog.createdAt, timeFormat) : ""}
        </div>

        {unreadCount > 0 && <div className="unread">
            {unreadCount}
          </div>}
      </div>

    </div>;
}
