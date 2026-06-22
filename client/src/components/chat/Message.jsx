import {
  memo,
  useEffect,
  useRef,
  useState
} from "react";

import { createPortal }
from "react-dom";

import { formatTime }
from "../../utils/date";

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

  const [menuPos, setMenuPos] =
    useState({
      top: 0,
      left: 0
    });

  const [viewerOpen, setViewerOpen] =
    useState(false);

  const [mobileMenu, setMobileMenu] =
    useState(false);

  const longPressRef =
    useRef(null);

  const touchPointRef =
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

    function closeFloatingMenu() {
      setMenuOpen(false);
    }

    document.addEventListener(
      "mousedown",
      handleOutside
    );

    window.addEventListener(
      "keydown",
      handleEsc
    );

    window.addEventListener(
      "scroll",
      closeFloatingMenu,
      true
    );

    window.addEventListener(
      "resize",
      closeFloatingMenu
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

      window.removeEventListener(
        "scroll",
        closeFloatingMenu,
        true
      );

      window.removeEventListener(
        "resize",
        closeFloatingMenu
      );
    };

  }, [menuOpen]);

  function isMobile() {
    return window.matchMedia(
      "(max-width: 768px)"
    ).matches;
  }

  function getEventPoint(e) {

    if (
      e.clientX !== undefined &&
      e.clientY !== undefined
    ) {
      return {
        x: e.clientX,
        y: e.clientY
      };
    }

    if (touchPointRef.current) {
      return touchPointRef.current;
    }

    const rect =
      messageRef.current?.getBoundingClientRect();

    if (!rect) {
      return {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2
      };
    }

    return {
      x: isMine ? rect.right : rect.left,
      y: rect.top + rect.height / 2
    };

  }

  function calculateMenuPosition(e) {

    const point =
      getEventPoint(e);

    const menuWidth = 178;
    const menuHeight = 270;
    const gap = 8;
    const padding = 10;

    let left =
      isMine
        ? point.x - menuWidth
        : point.x;

    left =
      Math.max(
        padding,
        Math.min(
          left,
          window.innerWidth - menuWidth - padding
        )
      );

    const spaceBelow =
      window.innerHeight - point.y;

    const spaceAbove =
      point.y;

    let top;

    if (spaceBelow >= menuHeight + gap) {
      top = point.y + gap;
    } else if (spaceAbove >= menuHeight + gap) {
      top = point.y - menuHeight - gap;
    } else {
      top =
        Math.max(
          padding,
          Math.min(
            point.y - menuHeight / 2,
            window.innerHeight - menuHeight - padding
          )
        );
    }

    setMenuPos({
      top,
      left
    });

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

    calculateMenuPosition(e);
    setMenuOpen(true);

  }

  function handleContextMenu(e) {
    openMenu(e);
  }

  function handleTouchStart(e) {

    if (
      e.target.closest("a") ||
      e.target.closest("textarea") ||
      e.target.closest("input") ||
      e.target.closest("button")
    ) {
      return;
    }

    const touch =
      e.touches?.[0];

    if (touch) {
      touchPointRef.current = {
        x: touch.clientX,
        y: touch.clientY
      };
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

  function renderDesktopMenu() {

    if (!menuOpen) {
      return null;
    }

    return createPortal(
      <div
        ref={menuRef}
        className="message-menu telegram-action-menu"
        style={{
          top: `${menuPos.top}px`,
          left: `${menuPos.left}px`
        }}
      >
        {renderActions()}
      </div>,
      document.body
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
        onTouchStart={handleTouchStart}
        onTouchEnd={clearLongPress}
        onTouchMove={clearLongPress}
        onTouchCancel={clearLongPress}
      >

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

      {renderDesktopMenu()}

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