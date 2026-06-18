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

function Message({
  message,
  username,
  onEdit,
  onDelete,
  onReply
}) {

  const { t } =
    useLanguage();

  const [menuOpen, setMenuOpen] =
    useState(false);

  const [viewerOpen, setViewerOpen] =
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
      ? `${API}${attachment.url}`
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
      }

    }

    document.addEventListener(
      "mousedown",
      handleOutside
    );

    document.addEventListener(
      "touchstart",
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

      document.removeEventListener(
        "touchstart",
        handleOutside
      );

      window.removeEventListener(
        "keydown",
        handleEsc
      );
    };

  }, [menuOpen]);

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

    setMenuOpen(true);

  }

  function handleContextMenu(e) {
    openMenu(e);
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

  function copyMessage() {

    if (message.text) {
      navigator.clipboard?.writeText(
        message.text
      );
    }

    setMenuOpen(false);

  }

  function fakeAction() {
    setMenuOpen(false);
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

  return (
    <>
      <div
        ref={messageRef}
        className={[
          "message",
          isMine ? "me" : "",
          isPhoto ? "photo-message" : "",
          isFile ? "file-message" : "",
          menuOpen ? "menu-open" : ""
        ].join(" ")}
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchEnd={clearLongPress}
        onTouchMove={clearLongPress}
        onTouchCancel={clearLongPress}
      >

        {menuOpen && (
          <div
            ref={menuRef}
            className="message-menu telegram-action-menu"
          >

            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
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
                  setMenuOpen(false);
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
              <span>⌲</span>
              Переслать
            </button>

            <button
              type="button"
              onClick={fakeAction}
            >
              <span>⌖</span>
              Выбрать
            </button>

            <button
              type="button"
              onClick={fakeAction}
            >
              <span>📌</span>
              Закрепить
            </button>

            <button
              type="button"
              className="danger"
              onClick={() => {
                setMenuOpen(false);
                onDelete(message);
              }}
            >
              <span>⌫</span>
              {t.delete || "Удалить"}
            </button>

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
              📄
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