import { createPortal } from "react-dom";

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
  if (!open) return null;

  return createPortal(
    <div className="media-viewer" onClick={onClose}>
      <div className="media-viewer-top" onClick={(e) => e.stopPropagation()}>
        <div className="media-viewer-title">{attachment.name || ""}</div>
        <div className="media-viewer-actions">
          <button type="button" onClick={onDownload}>↓</button>
          <button type="button" onClick={onClose}>×</button>
        </div>
      </div>

      <div className="media-viewer-body">
        {isPhoto && (
          <img
            src={fileUrl}
            alt={attachment.name || ""}
            className="media-viewer-img"
            onClick={(e) => e.stopPropagation()}
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
            style={{ "--video-ratio": videoRatio }}
            onLoadedMetadata={onVideoMetadata}
            onClick={(e) => e.stopPropagation()}
          />
        )}
      </div>
    </div>,
    document.body
  );
}
