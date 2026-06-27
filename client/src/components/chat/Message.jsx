import {
  memo,
  useEffect,
  useRef,
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

const DB_NAME =
  "liotan-offline-media";

const STORE_NAME =
  "media";

const AUTO_CACHE_LIMIT =
  50 * 1024 * 1024;

function openMediaDb() {

  return new Promise((resolve, reject) => {

    const request =
      indexedDB.open(
        DB_NAME,
        1
      );

    request.onupgradeneeded =
      () => {
        const db =
          request.result;

        if (
          !db.objectStoreNames.contains(
            STORE_NAME
          )
        ) {
          db.createObjectStore(
            STORE_NAME
          );
        }
      };

    request.onsuccess =
      () => resolve(request.result);

    request.onerror =
      () => reject(request.error);

  });

}

async function getOfflineBlob(key) {

  const db =
    await openMediaDb();

  return new Promise((resolve, reject) => {

    const tx =
      db.transaction(
        STORE_NAME,
        "readonly"
      );

    const store =
      tx.objectStore(
        STORE_NAME
      );

    const request =
      store.get(key);

    request.onsuccess =
      () => resolve(request.result || null);

    request.onerror =
      () => reject(request.error);

  });

}

async function saveOfflineBlob(
  key,
  blob
) {

  const db =
    await openMediaDb();

  return new Promise((resolve, reject) => {

    const tx =
      db.transaction(
        STORE_NAME,
        "readwrite"
      );

    const store =
      tx.objectStore(
        STORE_NAME
      );

    store.put(
      blob,
      key
    );

    tx.oncomplete =
      () => resolve();

    tx.onerror =
      () => reject(tx.error);

  });

}

function getMediaKey(
  attachment
) {

  return (
    attachment?.publicId ||
    attachment?.url ||
    ""
  );

}

function formatFileSize(size) {

  if (!size) {
    return "";
  }

  if (size < 1024 * 1024) {
    return `${Math.ceil(size / 1024)} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1)} MB`;

}

function formatDuration(value) {

  if (!Number.isFinite(value)) {
    return "0:00";
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

function Message({
  message,
  username,
  onEdit,
  onDelete,
  onReply,
  onPin
}) {

  const { t } =
    useLanguage();

  const [menuOpen, setMenuOpen] =
    useState(false);

  const [menuPos, setMenuPos] =
    useState({
      top: 0,
      left: 0
    });

  const [viewerOpen, setViewerOpen] =
    useState(false);

  const [mobileMenu, setMobileMenu] =
    useState(false);

  const [localUrl, setLocalUrl] =
    useState("");

  const [savingOffline, setSavingOffline] =
    useState(false);

  const [isOfflineSaved, setIsOfflineSaved] =
    useState(false);

  const [audioPlaying, setAudioPlaying] =
    useState(false);

  const [audioProgress, setAudioProgress] =
    useState(0);

  const [audioDuration, setAudioDuration] =
    useState(0);

  const [videoDuration, setVideoDuration] =
    useState(0);

  const [videoRatio, setVideoRatio] =
    useState("16 / 9");

  const longPressRef =
    useRef(null);

  const touchPointRef =
    useRef(null);

  const menuRef =
    useRef(null);

  const messageRef =
    useRef(null);

  const audioRef =
    useRef(null);

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

  const fileUrl =
    localUrl || remoteUrl;

  const mediaKey =
    getMediaKey(
      attachment
    );

  const shouldAutoCache =
    hasAttachment &&
    attachment.size > 0 &&
    attachment.size <= AUTO_CACHE_LIMIT &&
    (
      isPhoto ||
      isVideo ||
      isAudio
    );

  useEffect(() => {

    let alive =
      true;

    let objectUrl =
      "";

    async function loadOffline() {

      if (!mediaKey) {
        return;
      }

      try {

        const blob =
          await getOfflineBlob(
            mediaKey
          );

        if (
          !blob ||
          !alive
        ) {
          return;
        }

        objectUrl =
          URL.createObjectURL(
            blob
          );

        setLocalUrl(
          objectUrl
        );

        setIsOfflineSaved(
          true
        );

      } catch (err) {
        console.error(err);
      }

    }

    loadOffline();

    return () => {

      alive =
        false;

      if (objectUrl) {
        URL.revokeObjectURL(
          objectUrl
        );
      }

    };

  }, [
    mediaKey
  ]);

  useEffect(() => {

    if (
      !shouldAutoCache ||
      isOfflineSaved ||
      savingOffline
    ) {
      return;
    }

    saveOffline({
      silent: true
    });

  }, [
    shouldAutoCache,
    isOfflineSaved,
    savingOffline
  ]);

  useEffect(() => {

    function handleOutside(e) {

      if (!menuOpen) {
        return;
      }

      if (
        menuRef.current &&
        menuRef.current.contains(e.target)
      ) {
        return;
      }

      if (
        messageRef.current &&
        messageRef.current.contains(e.target)
      ) {
        return;
      }

      setMenuOpen(false);

    }

    function handleEsc(e) {

      if (e.key === "Escape") {
        setMenuOpen(false);
        setMobileMenu(false);
        setViewerOpen(false);
      }

    }

    function closeFloatingMenu() {
      setMenuOpen(false);
    }

    document.addEventListener(
      "mousedown",
      handleOutside
    );

    window.addEventListener(
      "keydown",
      handleEsc
    );

    window.addEventListener(
      "scroll",
      closeFloatingMenu,
      true
    );

    window.addEventListener(
      "resize",
      closeFloatingMenu
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handleOutside
      );

      window.removeEventListener(
        "keydown",
        handleEsc
      );

      window.removeEventListener(
        "scroll",
        closeFloatingMenu,
        true
      );

      window.removeEventListener(
        "resize",
        closeFloatingMenu
      );
    };

  }, [menuOpen]);

  function isMobile() {
    return window.matchMedia(
      "(max-width: 768px)"
    ).matches;
  }

  function getEventPoint(e) {

    if (
      e.clientX !== undefined &&
      e.clientY !== undefined
    ) {
      return {
        x: e.clientX,
        y: e.clientY
      };
    }

    if (touchPointRef.current) {
      return touchPointRef.current;
    }

    const rect =
      messageRef.current?.getBoundingClientRect();

    if (!rect) {
      return {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2
      };
    }

    return {
      x: isMine ? rect.right : rect.left,
      y: rect.top + rect.height / 2
    };

  }

  function calculateMenuPosition(e) {

    const point =
      getEventPoint(e);

    const menuWidth = 178;
    const menuHeight = 270;
    const gap = 8;
    const padding = 10;

    let left =
      isMine
        ? point.x - menuWidth
        : point.x;

    left =
      Math.max(
        padding,
        Math.min(
          left,
          window.innerWidth - menuWidth - padding
        )
      );

    const spaceBelow =
      window.innerHeight - point.y;

    const spaceAbove =
      point.y;

    let top;

    if (spaceBelow >= menuHeight + gap) {
      top = point.y + gap;
    } else if (spaceAbove >= menuHeight + gap) {
      top = point.y - menuHeight - gap;
    } else {
      top =
        Math.max(
          padding,
          Math.min(
            point.y - menuHeight / 2,
            window.innerHeight - menuHeight - padding
          )
        );
    }

    setMenuPos({
      top,
      left
    });

  }

  function openMenu(e) {

    if (
      e.target.closest("a") ||
      e.target.closest("textarea") ||
      e.target.closest("input") ||
      e.target.closest("button") ||
      e.target.closest("video") ||
      e.target.closest("audio")
    ) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    if (isMobile()) {
      setMobileMenu(true);
      return;
    }

    calculateMenuPosition(e);
    setMenuOpen(true);

  }

  function handleContextMenu(e) {
    openMenu(e);
  }

  function handleTouchStart(e) {

    if (
      e.target.closest("a") ||
      e.target.closest("textarea") ||
      e.target.closest("input") ||
      e.target.closest("button") ||
      e.target.closest("video") ||
      e.target.closest("audio")
    ) {
      return;
    }

    const touch =
      e.touches?.[0];

    if (touch) {
      touchPointRef.current = {
        x: touch.clientX,
        y: touch.clientY
      };
    }

    longPressRef.current =
      setTimeout(() => {
        openMenu(e);
      }, 420);

  }

  function clearLongPress() {

    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }

  }

  function closeMenus() {
    setMenuOpen(false);
    setMobileMenu(false);
  }

  function copyMessage() {

    if (message.text) {
      navigator.clipboard?.writeText(
        message.text
      );
    }

    closeMenus();

  }

  function fakeAction() {
    closeMenus();
  }

  async function saveOffline(
    options = {}
  ) {

    if (
      !remoteUrl ||
      !mediaKey ||
      savingOffline
    ) {
      return;
    }

    try {

      setSavingOffline(
        true
      );

      const response =
        await fetch(
          remoteUrl
        );

      const blob =
        await response.blob();

      await saveOfflineBlob(
        mediaKey,
        blob
      );

      const objectUrl =
        URL.createObjectURL(
          blob
        );

      setLocalUrl(
        objectUrl
      );

      setIsOfflineSaved(
        true
      );

    } catch (err) {
      if (!options.silent) {
        console.error(err);
      }
    } finally {
      setSavingOffline(
        false
      );
    }

  }

  async function downloadFile() {

    if (!remoteUrl && !fileUrl) {
      return;
    }

    try {

      if (
        mediaKey &&
        !isOfflineSaved &&
        remoteUrl
      ) {
        await saveOffline();
      }

      const link =
        document.createElement("a");

      link.href =
        localUrl || fileUrl || remoteUrl;

      link.download =
        attachment.name || "download";

      document.body.appendChild(
        link
      );

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

  function toggleAudio() {

    const audio =
      audioRef.current;

    if (!audio) {
      return;
    }

    if (audio.paused) {
      audio.play();
    } else {
      audio.pause();
    }

  }

  function seekAudio(e) {

    const audio =
      audioRef.current;

    if (
      !audio ||
      !audioDuration
    ) {
      return;
    }

    const nextTime =
      Number(e.target.value);

    audio.currentTime =
      nextTime;

    setAudioProgress(
      nextTime
    );

  }

  function playNextAudio() {

    const audio =
      audioRef.current;

    if (audio) {
      audio.currentTime = 0;
    }

    setAudioPlaying(false);
    setAudioProgress(0);

    const current =
      messageRef.current;

    const audioMessages =
      Array.from(
        document.querySelectorAll(
          "[data-audio-message-id]"
        )
      );

    const index =
      audioMessages.indexOf(current);

    const next =
      audioMessages[index + 1];

    const button =
      next?.querySelector(
        ".audio-play-button"
      );

    button?.click();

  }

  function getReplyPreview(replyTo) {

    if (!replyTo) {
      return "";
    }

    if (replyTo.text) {
      return replyTo.text;
    }

    if (replyTo.attachmentType === "photo") {
      return t.photo || "Фото";
    }

    if (replyTo.attachmentType === "video") {
      return "Видео";
    }

    if (replyTo.attachmentType === "audio") {
      return "Аудио";
    }

    if (replyTo.attachmentType === "file") {
      return replyTo.attachmentName || t.file || "Файл";
    }

    return t.message || "Сообщение";

  }

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

  function renderTextWithLinks(value) {

    const parts =
      value.split(
        /(https?:\/\/[^\s]+)/g
      );

    return parts.map((part, index) => {

      if (
        part.startsWith("http://") ||
        part.startsWith("https://")
      ) {
        return (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noreferrer"
            className="message-link"
            onClick={(e) =>
              e.stopPropagation()
            }
            onContextMenu={(e) =>
              e.stopPropagation()
            }
          >
            {part}
          </a>
        );
      }

      return part;

    });

  }

  function renderActions() {
    return (
      <>
        <button
          type="button"
          onClick={() => {
            closeMenus();
            onReply(message);
          }}
        >
          <span>↩</span>
          {t.reply || "Ответить"}
        </button>

        {message.text && (
          <button
            type="button"
            onClick={copyMessage}
          >
            <span>⧉</span>
            Скопировать
          </button>
        )}

        {canEdit && (
          <button
            type="button"
            onClick={() => {
              closeMenus();
              onEdit(message);
            }}
          >
            <span>✎</span>
            {t.edit || "Изменить"}
          </button>
        )}

        {hasAttachment && (
          <button
            type="button"
            onClick={() => {
              closeMenus();
              downloadFile();
            }}
          >
            <span>↓</span>
            Скачать
          </button>
        )}

        <button
          type="button"
          onClick={fakeAction}
        >
          <span>↗</span>
          Переслать
        </button>

        <button
          type="button"
          onClick={fakeAction}
        >
          <span>✓</span>
          Выбрать
        </button>

        <button
          type="button"
          onClick={() => {
            closeMenus();
            onPin?.(message);
          }}
        >
          <span>⌖</span>

          {message.isPinned
            ? "Открепить"
            : "Закрепить"}
        </button>

        <button
          type="button"
          className="danger"
          onClick={() => {
            closeMenus();
            onDelete(message);
          }}
        >
          <span>×</span>
          {t.delete || "Удалить"}
        </button>
      </>
    );
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
        {renderActions()}
      </div>,
      document.body
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
            ? setViewerOpen(true)
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
          onLoadedMetadata={(e) => {

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

            setVideoDuration(
              video.duration
            );

          }}
        />

        <button
          type="button"
          className="message-video-play"
        >
          ▶
        </button>

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

        <div className="photo-time-layer">
          {formatTime(message.createdAt)}
          {renderStatus()}
        </div>
      </div>
    );

  }

  function renderAudio() {

    return (
      <div className="message-audio">

        <button
          type="button"
          className="audio-play-button"
          onClick={toggleAudio}
        >
          {audioPlaying ? "❚❚" : "▶"}
        </button>

        <div className="audio-main">
          <div className="audio-title">
            {attachment.name || "Аудио"}
          </div>

          <input
            className="audio-range"
            type="range"
            min="0"
            max={audioDuration || 0}
            step="0.01"
            value={audioProgress}
            onChange={seekAudio}
          />

          <div className="audio-meta">
            <span>
              {formatDuration(audioProgress)}
            </span>

            <span>
              {formatDuration(audioDuration)}
            </span>
          </div>
        </div>

        <audio
          ref={audioRef}
          src={fileUrl}
          preload="metadata"
          onPlay={() =>
            setAudioPlaying(true)
          }
          onPause={() =>
            setAudioPlaying(false)
          }
          onEnded={playNextAudio}
          onLoadedMetadata={(e) =>
            setAudioDuration(
              e.currentTarget.duration
            )
          }
          onTimeUpdate={(e) =>
            setAudioProgress(
              e.currentTarget.currentTime
            )
          }
        />
      </div>
    );

  }

  function renderFile() {

    return (
      <div className="message-file">
        <div className="message-file-icon">
          □
        </div>

        <div className="message-file-info">
          <div className="message-file-name">
            {attachment.name || t.file}
          </div>

          <div className="message-file-size">
            {formatFileSize(attachment.size)}
          </div>
        </div>
      </div>
    );

  }

  function renderViewer() {

    if (!viewerOpen) {
      return null;
    }

    return createPortal(
      <div
        className="media-viewer"
        onClick={() =>
          setViewerOpen(false)
        }
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
                downloadFile();
              }}
            >
              ↓
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setViewerOpen(false);
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
              style={{
                "--video-ratio": videoRatio
              }}
              onLoadedMetadata={(e) => {

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

              }}
            />
          )}
        </div>
      </div>,
      document.body
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

        {message.replyTo?.messageId && (
          <div className="message-reply">
            <div className="message-reply-author">
              {message.replyTo.from}
            </div>

            <div className="message-reply-text">
              {getReplyPreview(message.replyTo)}
            </div>
          </div>
        )}

        {isPhoto && (
          <div
            className="message-photo-wrap"
            onClick={() =>
              setViewerOpen(true)
            }
          >
            <img
              src={fileUrl}
              alt={attachment.name || ""}
              className="message-photo"
            />

            <div className="photo-time-layer">
              {formatTime(message.createdAt)}
              {renderStatus()}
            </div>
          </div>
        )}

        {isVideo && renderVideo()}

        {isAudio && renderAudio()}

        {isFile && renderFile()}

        {message.text && (
          <div className="message-text">
            {renderTextWithLinks(message.text)}
          </div>
        )}

        {!isPhoto && !isVideo && (
          <div className="message-time">
            {message.edited && (
              <span className="message-edited">
                {t.edited}
              </span>
            )}

            {formatTime(message.createdAt)}
            {renderStatus()}
          </div>
        )}
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
            {renderActions()}
          </div>
        </div>
      )}

      {renderViewer()}
    </>
  );

}

export default memo(Message);