function getDraftTitle(items) {

  const photos =
    items.filter(item =>
      item.type === "photo"
    ).length;

  const videos =
    items.filter(item =>
      item.type === "video"
    ).length;

  if (
    items.length === 1 &&
    videos === 1
  ) {
    return "Отправить 1 видео";
  }

  if (
    items.length === 1 &&
    photos === 1
  ) {
    return "Отправить 1 фото";
  }

  if (
    videos > 0 &&
    photos > 0
  ) {
    return `Отправить ${items.length} медиа`;
  }

  if (videos > 0) {
    return `Отправить ${videos} видео`;
  }

  return `Отправить ${photos} фото`;

}

function formatDuration(value) {

  if (!Number.isFinite(value)) {
    return "";
  }

  const total =
    Math.floor(value);

  const minutes =
    Math.floor(total / 60);

  const seconds =
    String(total % 60).padStart(
      2,
      "0"
    );

  return `${minutes}:${seconds}`;

}

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
            {getDraftTitle(
              attachmentDraft
            )}
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
              className={[
                "attachment-preview-item",
                item.type === "video"
                  ? "attachment-preview-video-item"
                  : ""
              ].join(" ")}
            >
              {item.type === "video" ? (
                <video
                  src={item.url}
                  controls
                  playsInline
                  preload="metadata"
                  className="attachment-preview-video"
                />
              ) : (
                <img
                  src={item.url}
                  alt=""
                />
              )}

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