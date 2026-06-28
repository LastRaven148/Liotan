import { createPortal }
from "react-dom";

export default function MessageViewer({
  open,
  attachment,
  fileUrl,
  isPhoto,
  isVideo,
  videoRatio,
  onClose,
  onDownload,
  onVideoMetadata
}) {
  if (!open) {
    return null;
  }

  return createPortal(
    <div
      className="media-viewer"
      onClick={onClose}
    >
      <div className="media-viewer-top">
        <div className="media-viewer-title">
          {attachment.name || ""}
        </div>

        <div className="media-viewer-actions">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDownload();
            }}
          >
            ↓
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
          >
            ×
          </button>
        </div>
      </div>

      <div
        className="media-viewer-body"
        onClick={(e) =>
          e.stopPropagation()
        }
      >
        {isPhoto && (
          <img
            src={fileUrl}
            alt={attachment.name || ""}
            className="media-viewer-img"
          />
        )}

        {isVideo && (
          <video
            src={fileUrl}
            className="media-viewer-video"
            controls
            autoPlay
            playsInline
            loop
            style={{
              "--video-ratio": videoRatio
            }}
            onLoadedMetadata={onVideoMetadata}
          />
        )}
      </div>
    </div>,
    document.body
  );
}