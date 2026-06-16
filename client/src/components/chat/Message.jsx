import {
  memo,
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

  function handleContextMenu(e) {

    e.preventDefault();

    setMenuOpen(
      prev => !prev
    );

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

  return (
    <>
      <div
        className={[
          "message",
          isMine ? "me" : "",
          isPhoto ? "photo-message" : "",
          isFile ? "file-message" : ""
        ].join(" ")}
        onContextMenu={handleContextMenu}
      >

        {menuOpen && (
          <div className="message-menu">

            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onReply(message);
              }}
            >
              {t.reply}
            </button>

            {canEdit && (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onEdit(message);
                }}
              >
                {t.edit}
              </button>
            )}

            <button
              type="button"
              className="danger"
              onClick={() => {
                setMenuOpen(false);
                onDelete(message);
              }}
            >
              {t.delete}
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
            {message.text}
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