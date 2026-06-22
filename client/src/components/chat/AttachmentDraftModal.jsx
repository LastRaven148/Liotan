export default function AttachmentDraftModal({
  attachmentDraft,
  attachmentCaption,
  setAttachmentCaption,
  sendingDraft,
  onClose,
  onRemove,
  onSend,
  onAddMore
}) {

  if (!attachmentDraft.length) {
    return null;
  }

  return (
    <div className="attachment-preview-overlay">
      <div className="attachment-preview-modal">

        <div className="attachment-preview-header">
          <button
            type="button"
            className="attachment-preview-close"
            onClick={onClose}
          >
            ×
          </button>

          <div className="attachment-preview-title">
            {attachmentDraft.length === 1
              ? "Отправить 1 фото"
              : `Отправить ${attachmentDraft.length} фото`}
          </div>

          <button
            type="button"
            className="attachment-preview-more"
          >
            ⋮
          </button>
        </div>

        <div className="attachment-preview-list">
          {attachmentDraft.map((item, index) => (
            <div
              key={item.url}
              className="attachment-preview-item"
            >
              <img
                src={item.url}
                alt=""
              />

              <button
                type="button"
                className="attachment-preview-remove"
                onClick={() =>
                  onRemove(index)
                }
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <div className="attachment-preview-footer">
          <button
            type="button"
            className="attachment-preview-add"
            onClick={onAddMore}
            disabled={
              attachmentDraft.length >= 10
            }
          >
            +
          </button>

          <input
            value={attachmentCaption}
            onChange={(e) =>
              setAttachmentCaption(
                e.target.value
              )
            }
            placeholder="Добавить подпись..."
          />

          <button
            type="button"
            className="attachment-preview-send"
            onClick={onSend}
            disabled={sendingDraft}
          >
            ➤
          </button>
        </div>

      </div>
    </div>
  );

}