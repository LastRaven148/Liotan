import {
  getMessagePreview
} from "./chatUtils";

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
                {t.photo}
              </button>

              <button
                type="button"
                onClick={() =>
                  fileInputRef.current?.click()
                }
              >
                {t.file}
              </button>

            </div>
          )}

          <input
            ref={photoInputRef}
            type="file"
            hidden
            multiple
            accept="image/*"
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