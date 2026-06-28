import {
  useEffect,
  useState
} from "react";

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

function getItemClass(item) {
  const base = [
    "attachment-preview-item"
  ];

  if (item.type === "video") {
    base.push(
      "attachment-preview-video-item"
    );
  }

  if (item.orientation) {
    base.push(
      `attachment-preview-${item.orientation}`
    );
  }

  return base.join(" ");
}

export default function AttachmentDraftModal({
  attachmentDraft,
  attachmentCaption,
  setAttachmentCaption,
  sendingDraft,
  onClose,
  onRemove,
  onSend,
  onAddMore,
  onMediaMeta
}) {

  const [
    menuOpen,
    setMenuOpen
  ] = useState(false);

  useEffect(() => {

    function handleKeyDown(e) {
      if (!attachmentDraft.length) {
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();

        if (!sendingDraft) {
          onSend?.();
        }

        return;
      }

      if (
        e.key === "Enter" &&
        !e.shiftKey
      ) {
        e.preventDefault();

        if (!sendingDraft) {
          onSend?.();
        }
      }
    }

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };

  }, [
    attachmentDraft.length,
    sendingDraft,
    onSend
  ]);

  if (!attachmentDraft.length) {
    return null;
  }

  return (
    <div
      className="attachment-preview-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose?.();
        }
      }}
    >
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
            {getDraftTitle(attachmentDraft)}
          </div>

          <div className="attachment-preview-menu-wrap">
            <button
              type="button"
              className="attachment-preview-more"
              onClick={() =>
                setMenuOpen(prev => !prev)
              }
            >
              ⋮
            </button>

            {menuOpen && (
              <div className="attachment-preview-menu">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onAddMore?.();
                  }}
                >
                  <span className="attachment-preview-menu-icon">
                    +
                  </span>

                  <span>
                    Добавить
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setMenuOpen(false)
                  }
                >
                  <span className="attachment-preview-menu-icon">
                    ✓
                  </span>

                  <span>
                    Отправить без сжатия
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="attachment-preview-list">
          {attachmentDraft.map((item, index) => (
            <div
              key={item.url}
              className={getItemClass(item)}
              style={
                item.ratio
                  ? {
                      "--draft-media-ratio": item.ratio
                    }
                  : undefined
              }
            >
              {item.type === "video" ? (
                <video
                  src={item.url}
                  controls
                  playsInline
                  preload="metadata"
                  className="attachment-preview-video"
                  onLoadedMetadata={(e) => {
                    const video =
                      e.currentTarget;

                    if (
                      video.videoWidth &&
                      video.videoHeight
                    ) {
                      onMediaMeta?.(
                        index,
                        {
                          width:
                            video.videoWidth,
                          height:
                            video.videoHeight
                        }
                      );
                    }
                  }}
                />
              ) : (
                <img
                  src={item.url}
                  alt=""
                  onLoad={(e) => {
                    const img =
                      e.currentTarget;

                    if (
                      img.naturalWidth &&
                      img.naturalHeight
                    ) {
                      onMediaMeta?.(
                        index,
                        {
                          width:
                            img.naturalWidth,
                          height:
                            img.naturalHeight
                        }
                      );
                    }
                  }}
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

        <div className="attachment-preview-caption">
          <input
            value={attachmentCaption}
            onChange={(e) =>
              setAttachmentCaption(e.target.value)
            }
            placeholder="Добавить подпись..."
          />

          <button
            type="button"
            className="attachment-preview-send"
            onClick={onSend}
            disabled={sendingDraft}
          >
            {sendingDraft ? "…" : "➤"}
          </button>
        </div>

      </div>
    </div>
  );

}