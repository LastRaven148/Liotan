import {
  memo,
  useEffect,
  useRef,
  useState
} from "react";

import { formatTime }
from "../../utils/date";

import { API }
from "../../config/api";

import {
  useLanguage
} from "../../context/LanguageContext";

import { mediaUrl }
from "../../utils/mediaUrl";

function Message({
  message,
  username,
  onEdit,
  onDelete,
  onReply,
  onPin
}) {

  const { t } =
    useLanguage();

  const [menuOpen, setMenuOpen] =
    useState(false);

  const [viewerOpen, setViewerOpen] =
    useState(false);

  const [mobileMenu, setMobileMenu] =
    useState(false);

  const longPressRef =
    useRef(null);

  const menuRef =
    useRef(null);

  const messageRef =
    useRef(null);

  const isMine =
    message.from === username;

  const attachment =
    message.attachment;

  const hasAttachment =
    attachment &&
    attachment.url;

  const isPhoto =
    hasAttachment &&
    attachment.type === "photo";

  const isFile =
    hasAttachment &&
    attachment.type === "file";

  const canEdit =
    isMine &&
    message.text &&
    !hasAttachment;

  const fileUrl =
  hasAttachment
    ? mediaUrl(attachment.url)
    : "";

  useEffect(() => {

    function handleOutside(e) {

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
        messageRef.current &&
        messageRef.current.contains(e.target)
      ) {
        return;
      }

      setMenuOpen(false);

    }

    function handleEsc(e) {

      if (e.key === "Escape") {
        setMenuOpen(false);
        setMobileMenu(false);
      }

    }

    document.addEventListener(
      "mousedown",
      handleOutside
    );

    window.addEventListener(
      "keydown",
      handleEsc
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handleOutside
      );

      window.removeEventListener(
        "keydown",
        handleEsc
      );
    };

  }, [menuOpen]);

  function isMobile() {
    return window.matchMedia(
      "(max-width: 768px)"
    ).matches;
  }

  function openMenu(e) {

    if (
      e.target.closest("a") ||
      e.target.closest("textarea") ||
      e.target.closest("input") ||
      e.target.closest("button")
    ) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    if (isMobile()) {
      setMobileMenu(true);
      return;
    }

    setMenuOpen(true);

  }

  function handleContextMenu(e) {
    openMenu(e);
  }

  function handleMouseLeave() {

    if (!menuOpen) {
      return;
    }

    setTimeout(() => {
      if (
        !menuRef.current?.matches(":hover") &&
        !messageRef.current?.matches(":hover")
      ) {
        setMenuOpen(false);
      }
    }, 120);

  }

  function handleTouchStart(e) {

    if (
      e.target.closest("a") ||
      e.target.closest("button")
    ) {
      return;
    }

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

  function closeMenus() {
    setMenuOpen(false);
    setMobileMenu(false);
  }

  function copyMessage() {

    if (message.text) {
      navigator.clipboard?.writeText(
        message.text
      );
    }

    closeMenus();

  }

  function fakeAction() {
    closeMenus();
  }

  function formatFileSize(size) {

    if (!size) {
      return "";
    }

    if (size < 1024 * 1024) {
      return `${Math.ceil(size / 1024)} KB`;
    }

    return `${(size / 1024 / 1024).toFixed(1)} MB`;

  }

  function getReplyPreview(replyTo) {

    if (!replyTo) {
      return "";
    }

    if (replyTo.text) {
      return replyTo.text;
    }

    if (replyTo.attachmentType === "photo") {
      return t.photo;
    }

    if (replyTo.attachmentType === "file") {
      return replyTo.attachmentName || t.file;
    }

    return t.message;

  }

  function renderStatus() {

    if (!isMine) {
      return null;
    }

    const status =
      message.status || "sent";

    if (status === "read") {
      return (
        <span className="message-status read">
          ✓✓
        </span>
      );
    }

    if (status === "delivered") {
      return (
        <span className="message-status delivered">
          ✓✓
        </span>
      );
    }

    return (
      <span className="message-status sent">
        ✓
      </span>
    );

  }

  function renderTextWithLinks(value) {

    const parts =
      value.split(
        /(https?:\/\/[^\s]+)/g
      );

    return parts.map((part, index) => {

      if (
        part.startsWith("http://") ||
        part.startsWith("https://")
      ) {
        return (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noreferrer"
            className="message-link"
            onClick={(e) =>
              e.stopPropagation()
            }
            onContextMenu={(e) =>
              e.stopPropagation()
            }
          >
            {part}
          </a>
        );
      }

      return part;

    });

  }

  function renderActions() {
    return (
      <>
        <button
          type="button"
          onClick={() => {
            closeMenus();
            onReply(message);
          }}
        >
          <span>↩</span>
          {t.reply || "Ответить"}
        </button>

        {message.text && (
          <button
            type="button"
            onClick={copyMessage}
          >
            <span>⧉</span>
            Скопировать
          </button>
        )}

        {canEdit && (
          <button
            type="button"
            onClick={() => {
              closeMenus();
              onEdit(message);
            }}
          >
            <span>✎</span>
            {t.edit || "Изменить"}
          </button>
        )}

        <button
          type="button"
          onClick={fakeAction}
        >
          <span>↗</span>
          Переслать
        </button>

        <button
          type="button"
          onClick={fakeAction}
        >
          <span>✓</span>
          Выбрать
        </button>

        <button
  type="button"
  onClick={() => {
    closeMenus();
    onPin?.(message);
  }}
>
  <span>⌖</span>

  {message.isPinned
    ? "Открепить"
    : "Закрепить"}
</button>

        <button
          type="button"
          className="danger"
          onClick={() => {
            closeMenus();
            onDelete(message);
          }}
        >
          <span>×</span>
          {t.delete || "Удалить"}
        </button>
      </>
    );
  }

  return (
    <>
      <div
        ref={messageRef}
        data-message-id={message._id}
        className={[
          "message",
          isMine ? "me" : "",
          isPhoto ? "photo-message" : "",
          isFile ? "file-message" : "",
          menuOpen ? "menu-open" : ""
        ].join(" ")}
        onContextMenu={handleContextMenu}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchEnd={clearLongPress}
        onTouchMove={clearLongPress}
        onTouchCancel={clearLongPress}
      >

        {menuOpen && (
          <div
            ref={menuRef}
            className="message-menu telegram-action-menu"
            onMouseLeave={handleMouseLeave}
          >
            {renderActions()}
          </div>
        )}

        {message.replyTo?.messageId && (
          <div className="message-reply">
            <div className="message-reply-author">
              {message.replyTo.from}
            </div>

            <div className="message-reply-text">
              {getReplyPreview(message.replyTo)}
            </div>
          </div>
        )}

        {isPhoto && (
          <div
            className="message-photo-wrap"
            onClick={() =>
              setViewerOpen(true)
            }
          >
            <img
              src={fileUrl}
              alt={attachment.name || ""}
              className="message-photo"
            />

            <div className="photo-time-layer">
              {formatTime(message.createdAt)}
              {renderStatus()}
            </div>
          </div>
        )}

        {isFile && (
          <a
            href={fileUrl}
            target="_blank"
            rel="noreferrer"
            download={attachment.name}
            className="message-file"
          >
            <div className="message-file-icon">
              □
            </div>

            <div className="message-file-info">
              <div className="message-file-name">
                {attachment.name || t.file}
              </div>

              <div className="message-file-size">
                {formatFileSize(attachment.size)}
              </div>
            </div>
          </a>
        )}

        {message.text && (
          <div className="message-text">
            {renderTextWithLinks(message.text)}
          </div>
        )}

        {!isPhoto && (
          <div className="message-time">
            {message.edited && (
              <span className="message-edited">
                {t.edited}
              </span>
            )}

            {formatTime(message.createdAt)}
            {renderStatus()}
          </div>
        )}
      </div>

      {mobileMenu && (
        <div
          className="mobile-action-overlay"
          onClick={closeMenus}
        >
          <div
            className="mobile-action-sheet"
            onClick={(e) =>
              e.stopPropagation()
            }
          >
            {renderActions()}
          </div>
        </div>
      )}

      {viewerOpen && (
        <div
          className="photo-viewer"
          onClick={() =>
            setViewerOpen(false)
          }
        >
          <button
            className="photo-viewer-close"
            type="button"
          >
            ×
          </button>

          <img
            src={fileUrl}
            alt={attachment.name || ""}
            className="photo-viewer-img"
          />
        </div>
      )}
    </>
  );

}

export default memo(Message);