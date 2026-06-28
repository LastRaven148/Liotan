import {
  mediaUrl
} from "../../../utils/mediaUrl";

import {
  formatDuration
} from "./messageFormatters";

export default function MessageVideo({
  attachment,
  caption,
  timeLayer,
  onOpen,
  onContextMenu,
  onDownload,
  onLoadedMetadata
}) {

  return (
    <div
      className="message-video-wrap"
      onClick={onOpen}
      onContextMenu={onContextMenu}
    >

      <video
        className="message-video"
        src={mediaUrl(attachment.url)}
        preload="metadata"
        muted
        playsInline
        onLoadedMetadata={onLoadedMetadata}
      />

      <button
        type="button"
        className="message-video-play"
        onClick={onOpen}
      >
        ▶
      </button>

      {!!attachment.duration && (
        <div className="video-duration-layer">
          {formatDuration(
            attachment.duration
          )}
        </div>
      )}

      <button
        type="button"
        className="video-download-layer"
        onClick={onDownload}
      >
        Скачать
      </button>

      {caption && (
        <div className="message-media-caption">
          {caption}
        </div>
      )}

      {timeLayer}

    </div>
  );

}