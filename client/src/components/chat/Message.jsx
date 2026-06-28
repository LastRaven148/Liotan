import {
  memo,
  useEffect,
  useState
} from "react";

import { createPortal }
from "react-dom";

import { formatTime }
from "../../utils/date";

import {
  useLanguage
} from "../../context/LanguageContext";

import { mediaUrl }
from "../../utils/mediaUrl";

import {
  formatDuration,
  formatFileSize
} from "./message/messageFormatters";

import {
  renderTextWithLinks
} from "./message/MessageText";

import useOfflineMedia
from "./message/useOfflineMedia";

import useMessageMenu
from "./message/useMessageMenu";

import useMessageAudioState
from "./message/useMessageAudioState";

import useMediaViewer
from "./message/useMediaViewer";

import MessageReply
from "./message/MessageReply";

import MessageText
from "./message/MessageText";

import MessageFile
from "./message/MessageFile";

import MessageAudio
from "./message/MessageAudio";

import MessageActions
from "./message/MessageActions";

import MessageViewer
from "./message/MessageViewer";

const AUTO_CACHE_LIMIT =
  50 * 1024 * 1024;

function Message({
  message,
  username,
  audioMessages = [],
  onEdit,
  onDelete,
  onReply,
  onPin
}) {
  const { t } =
    useLanguage();

  const [videoDuration, setVideoDuration] =
    useState(0);

  const [videoRatio, setVideoRatio] =
    useState("16 / 9");

  const isMine =
    message.from === username;

  const attachment =
    message.attachment;

  const hasAttachment =
    attachment &&
    attachment.url;

  const attachmentType =
    attachment?.type || "";

  const isPhoto =
    hasAttachment &&
    attachmentType === "photo";

  const isVideo =
    hasAttachment &&
    attachmentType === "video";

  const isAudio =
    hasAttachment &&
    attachmentType === "audio";

  const isFile =
    hasAttachment &&
    attachmentType === "file";

  const canEdit =
    isMine &&
    message.text &&
    !hasAttachment;

  const remoteUrl =
    hasAttachment
      ? mediaUrl(attachment.url)
      : "";

  const attachmentDuration =
    Number(attachment?.duration) || 0;

  const attachmentSizeText =
    formatFileSize(attachment?.size);

  const shouldAutoCache =
    hasAttachment &&
    attachment.size > 0 &&
    attachment.size <= AUTO_CACHE_LIMIT &&
    (
      isPhoto ||
      isAudio
    );

  const {
    localUrl,
    isOfflineSaved,
    saveOffline
  } = useOfflineMedia({
    attachment,
    remoteUrl,
    shouldAutoCache
  });

  const fileUrl =
    localUrl || remoteUrl;

  const {
    menuOpen,
    menuPos,
    mobileMenu,
    menuRef,
    messageRef,
    handleContextMenu,
    handleTouchStart,
    clearLongPress,
    closeMenus
  } = useMessageMenu({
    isMine
  });

  const {
    audioPlaying,
    audioStarted,
    audioProgress,
    audioDuration,
    setAudioProgress,
    setAudioDuration
  } = useMessageAudioState({
    messageId: message._id
  });

  const {
    viewerOpen,
    openViewer,
    closeViewer
  } = useMediaViewer();

  useEffect(() => {
    if (
      attachment?.width &&
      attachment?.height
    ) {
      setVideoRatio(
        `${attachment.width} / ${attachment.height}`
      );
    }

    if (attachmentDuration) {
      setVideoDuration(attachmentDuration);
      setAudioDuration(attachmentDuration);
    }
  }, [
    attachment?.width,
    attachment?.height,
    attachmentDuration,
    setAudioDuration
  ]);

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

  function renderTimeLayer() {
    return (
      <div className="photo-time-layer">
        {formatTime(message.createdAt)}
        {renderStatus()}
      </div>
    );
  }

  function renderMessageTime() {
    if (
      isPhoto ||
      isVideo
    ) {
      return null;
    }

    return (
      <div className="message-time">
        {message.edited && (
          <span className="message-edited">
            {t.edited}
          </span>
        )}

        {formatTime(message.createdAt)}
        {renderStatus()}
      </div>
    );
  }

  function renderMediaCaption() {
    if (!message.text) {
      return null;
    }

    return (
      <div className="message-media-caption">
        {renderTextWithLinks(message.text)}
      </div>
    );
  }

  async function downloadFile() {
    if (
      !remoteUrl &&
      !fileUrl
    ) {
      return;
    }

    try {
      if (
        hasAttachment &&
        !isOfflineSaved &&
        remoteUrl
      ) {
        await saveOffline();
      }

      const link =
        document.createElement("a");

      link.href =
        localUrl ||
        fileUrl ||
        remoteUrl;

      link.download =
        attachment.name || "download";

      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error(err);

      window.open(
        fileUrl || remoteUrl,
        "_blank"
      );
    }
  }

  function copyMessage() {
    if (message.text) {
      navigator.clipboard?.writeText(
        message.text
      );
    }

    closeMenus();
  }

  function toggleAudio() {
    if (
      !isAudio ||
      !attachment?.url
    ) {
      return;
    }

    const playlist =
      audioMessages.map(item => ({
        messageId: item._id,
        url: item.attachment.url,
        name:
          item.attachment.name ||
          "Аудио",
        duration:
          Number(item.attachment.duration) ||
          0,
        size:
          item.attachment.size ||
          0
      }));

    window.dispatchEvent(
      new CustomEvent(
        "liotan:play-audio",
        {
          detail: {
            messageId: message._id,
            url: attachment.url,
            name:
              attachment.name ||
              "Аудио",
            duration:
              audioDuration ||
              attachmentDuration,
            size:
              attachment.size ||
              0,
            playlist
          }
        }
      )
    );
  }

  function seekAudio(e) {
    const nextTime =
      Number(e.target.value);

    setAudioProgress(nextTime);

    window.dispatchEvent(
      new CustomEvent(
        "liotan:seek-audio",
        {
          detail: {
            messageId: message._id,
            time: nextTime
          }
        }
      )
    );
  }

  function handleVideoMetadata(e) {
    const video =
      e.currentTarget;

    if (
      video.videoWidth &&
      video.videoHeight
    ) {
      setVideoRatio(
        `${video.videoWidth} / ${video.videoHeight}`
      );
    }

    if (Number.isFinite(video.duration)) {
      setVideoDuration(video.duration);
    }
  }

  function renderDesktopMenu() {
    if (!menuOpen) {
      return null;
    }

    return createPortal(
      <div
        ref={menuRef}
        className="message-menu telegram-action-menu"
        style={{
          top: `${menuPos.top}px`,
          left: `${menuPos.left}px`
        }}
      >
        <MessageActions
          t={t}
          message={message}
          hasAttachment={hasAttachment}
          canEdit={canEdit}
          closeMenus={closeMenus}
          copyMessage={copyMessage}
          downloadFile={downloadFile}
          onReply={onReply}
          onEdit={onEdit}
          onDelete={onDelete}
          onPin={onPin}
        />
      </div>,
      document.body
    );
  }

  function renderPhoto() {
    return (
      <div
        className="message-photo-wrap"
        onClick={openViewer}
      >
        <img
          src={fileUrl}
          alt={attachment.name || ""}
          className="message-photo"
        />

        {renderMediaCaption()}
        {renderTimeLayer()}
      </div>
    );
  }

  function renderVideo() {
    const needsManualDownload =
      attachment.size > AUTO_CACHE_LIMIT &&
      !isOfflineSaved;

    return (
      <div
        className="message-video-wrap"
        onClick={() =>
          isOfflineSaved || !needsManualDownload
            ? openViewer()
            : downloadFile()
        }
        style={{
          "--video-ratio": videoRatio
        }}
      >
        <video
          src={fileUrl}
          className="message-video"
          preload="metadata"
          muted
          playsInline
          loop
          onLoadedMetadata={handleVideoMetadata}
        />

        <button
          type="button"
          className="message-video-play"
          aria-label="Открыть видео"
        />

        <div className="video-duration-layer">
          {formatDuration(videoDuration)}
        </div>

        {needsManualDownload && (
          <button
            type="button"
            className="video-download-layer"
            onClick={(e) => {
              e.stopPropagation();
              downloadFile();
            }}
          >
            ↓ {formatFileSize(attachment.size)}
          </button>
        )}

        {renderMediaCaption()}
        {renderTimeLayer()}
      </div>
    );
  }

  return (
    <>
      <div
        ref={messageRef}
        data-message-id={message._id}
        data-audio-message-id={
          isAudio ? message._id : undefined
        }
        className={[
          "message",
          isMine ? "me" : "",
          isPhoto ? "photo-message" : "",
          isVideo ? "video-message" : "",
          isAudio ? "audio-message" : "",
          isFile ? "file-message" : "",
          menuOpen ? "menu-open" : ""
        ].join(" ")}
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchEnd={clearLongPress}
        onTouchMove={clearLongPress}
        onTouchCancel={clearLongPress}
      >
        <MessageReply
          message={message}
          t={t}
        />

        {isPhoto && renderPhoto()}

        {isVideo && renderVideo()}

        {isAudio && (
          <MessageAudio
            attachment={attachment}
            audioPlaying={audioPlaying}
            audioStarted={audioStarted}
            audioProgress={audioProgress}
            audioDuration={audioDuration}
            attachmentSizeText={attachmentSizeText}
            onToggle={toggleAudio}
            onSeek={seekAudio}
          />
        )}

        {isFile && (
          <MessageFile
            attachment={attachment}
            fileUrl={fileUrl}
            t={t}
          />
        )}

        {message.text && !isPhoto && !isVideo && (
          <MessageText
            value={message.text}
          />
        )}

        {renderMessageTime()}
      </div>

      {renderDesktopMenu()}

      {mobileMenu && (
        <div
          className="mobile-action-overlay"
          onClick={closeMenus}
        >
          <div
            className="mobile-action-sheet"
            onClick={(e) =>
              e.stopPropagation()
            }
          >
            <MessageActions
              t={t}
              message={message}
              hasAttachment={hasAttachment}
              canEdit={canEdit}
              closeMenus={closeMenus}
              copyMessage={copyMessage}
              downloadFile={downloadFile}
              onReply={onReply}
              onEdit={onEdit}
              onDelete={onDelete}
              onPin={onPin}
            />
          </div>
        </div>
      )}

      <MessageViewer
        open={viewerOpen}
        attachment={attachment || {}}
        fileUrl={fileUrl}
        isPhoto={isPhoto}
        isVideo={isVideo}
        videoRatio={videoRatio}
        onClose={closeViewer}
        onDownload={downloadFile}
        onVideoMetadata={handleVideoMetadata}
      />
    </>
  );
}

export default memo(Message);