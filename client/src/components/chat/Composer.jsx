import {
  getMessagePreview
} from "./chatUtils";

function GalleryIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="3"
        y="5"
        width="18"
        height="14"
        rx="3"
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle
        cx="8"
        cy="10"
        r="1.7"
        fill="currentColor"
      />
      <path
        d="M5.5 17L10 12.5L13.2 15.7L15.2 13.7L19 17"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      aria-hidden="true"
    >
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

export default function Composer({
  t,
  text,
  setText,
  canSend,
  textareaRef,
  photoInputRef,
  fileInputRef,
  attachMenuOpen,
  setAttachMenuOpen,
  editingMessage,
  cancelEditMessage,
  replyMessage,
  cancelReplyMessage,
  onPaste,
  onPhotoChange,
  onFileChange,
  onSendClick,
  onKeyDown
}) {

  return (
    <div className="composer-shell">

      <style>
        {`
          .attach-menu {
            position: absolute;
            left: 0;
            bottom: 48px;
            width: 218px;
            padding: 6px;
            background: #17212b;
            border: 1px solid #263746;
            border-radius: 12px;
            box-shadow: 0 12px 34px rgba(0, 0, 0, .42);
            z-index: 80;
          }

          .attach-menu button {
            width: 100%;
            height: 42px;
            border: none;
            border-radius: 9px;
            background: transparent;
            color: #d7dde5;
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 0 11px;
            font-family: inherit;
            font-size: 14px;
            font-weight: 500;
            text-align: left;
            cursor: pointer;
          }

          .attach-menu button:hover {
            background: #243342;
          }

          .attach-menu-icon {
            width: 28px;
            height: 28px;
            color: #8fa4b8;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
          }

          .attach-menu-label {
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
        `}
      </style>

      {replyMessage && !editingMessage && (
        <div className="reply-panel">

          <div className="reply-panel-content">
            <div className="reply-panel-title">
              {t.replyingTo} {replyMessage.from}
            </div>

            <div className="reply-panel-text">
              {getMessagePreview(
                replyMessage,
                t
              )}
            </div>
          </div>

          <button
            type="button"
            className="reply-panel-close"
            onClick={cancelReplyMessage}
          >
            ×
          </button>

        </div>
      )}

      <div className="composer">

        {editingMessage && (
          <div className="edit-banner">
            <div>
              <div className="edit-banner-title">
                {t.editingMessage}
              </div>

              <div className="edit-banner-text">
                {editingMessage.text}
              </div>
            </div>

            <button
              type="button"
              onClick={cancelEditMessage}
            >
              ×
            </button>
          </div>
        )}

        <div className="attach-wrapper">

          <button
            type="button"
            className="attach-button"
            onClick={() =>
              setAttachMenuOpen(
                prev => !prev
              )
            }
          >
            +
          </button>

          {attachMenuOpen && (
            <div className="attach-menu">

              <button
                type="button"
                onClick={() =>
                  photoInputRef.current?.click()
                }
              >
                <span className="attach-menu-icon">
                  <GalleryIcon />
                </span>

                <span className="attach-menu-label">
                  Фото или видео
                </span>
              </button>

              <button
                type="button"
                onClick={() =>
                  fileInputRef.current?.click()
                }
              >
                <span className="attach-menu-icon">
                  <FileIcon />
                </span>

                <span className="attach-menu-label">
                  Файл
                </span>
              </button>

            </div>
          )}

          <input
            ref={photoInputRef}
            type="file"
            hidden
            multiple
            accept="image/*,video/*"
            onChange={onPhotoChange}
          />

          <input
  ref={fileInputRef}
  type="file"
  hidden
  onChange={onFileChange}
/>

        </div>

        <textarea
          ref={textareaRef}
          value={text}
          onPaste={onPaste}
          onChange={(e) => {

            setText(
              e.target.value
            );

            e.target.style.height =
              "auto";

            const newHeight =
              Math.min(
                e.target.scrollHeight,
                160
              );

            e.target.style.height =
              `${newHeight}px`;

          }}
          onKeyDown={onKeyDown}
          placeholder={
            editingMessage
              ? t.editMessage
              : t.message
          }
          rows={1}
        />

        <button
          type="button"
          className="send-button"
          onClick={onSendClick}
          disabled={!canSend}
        >
          ➤
        </button>

      </div>

    </div>
  );

}