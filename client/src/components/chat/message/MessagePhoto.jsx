import {
  mediaUrl
} from "../../../utils/mediaUrl";

export default function MessagePhoto({
  attachment,
  caption,
  timeLayer,
  onOpen,
  onContextMenu
}) {

  return (
    <div
      className="message-photo-wrap"
      onClick={onOpen}
      onContextMenu={onContextMenu}
    >

      <img
        className="message-photo"
        src={mediaUrl(attachment.url)}
        alt=""
        loading="lazy"
        draggable={false}
      />

      {caption && (
        <div className="message-media-caption">
          {caption}
        </div>
      )}

      {timeLayer}

    </div>
  );

}