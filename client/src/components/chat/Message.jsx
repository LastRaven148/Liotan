import { memo, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { formatTime } from "../../utils/date";
import { useLanguage } from "../../context/LanguageContext";
import { mediaUrl } from "../../utils/mediaUrl";
import { formatDuration, formatFileSize } from "./message/messageFormatters";
import { renderTextWithLinks } from "./message/MessageText";
import useOfflineMedia from "./message/useOfflineMedia";
import useMessageMenu from "./message/useMessageMenu";
import useMessageAudioState from "./message/useMessageAudioState";
import useMediaViewer from "./message/useMediaViewer";
import MessageReply from "./message/MessageReply";
import MessageText from "./message/MessageText";
import MessageFile from "./message/MessageFile";
import MessageAudio from "./message/MessageAudio";
import MessageVoice from "./message/MessageVoice";
import MessageActions from "./message/MessageActions";
import MessageViewer from "./message/MessageViewer";
import MessageTime from "./message/MessageTime";
import { decryptAttachmentBlobForChat, decryptTextForChat, isEncryptedAttachment, isEncryptedText } from "../../utils/e2ee";
import DownloadConfirmModal from "./message/DownloadConfirmModal";
const AUTO_CACHE_LIMIT = 50 * 1024 * 1024;
function safeDownloadName(name = "download") {
  return String(name || "download").replace(/[/\\0\r\n\t]/g, " ").replace(/[<>:"|?*]/g, "_").replace(/\s+/g, " ").trim().slice(0, 160) || "download";
}
function Message({
  message,
  username,
  activeChat,
  e2eeRevision = 0,
  audioMessages = [],
  onEdit,
  onDelete,
  onReply,
  onPin
}) {
  const {
    t
  } = useLanguage();
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoRatio, setVideoRatio] = useState("16 / 9");
  const [downloadConfirmOpen, setDownloadConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteForEveryone, setDeleteForEveryone] = useState(false);
  const [decryptedText, setDecryptedText] = useState(isEncryptedText(message.text) ? "" : message.text || "");
  const isMine = message.from === username;
  const attachment = message.attachment;
  const hasAttachment = attachment && attachment.url;
  const attachmentType = attachment?.type || "";
  const isPhoto = hasAttachment && attachmentType === "photo";
  const isVideo = hasAttachment && attachmentType === "video";
  const isAudio = hasAttachment && attachmentType === "audio";
  const isVoice = hasAttachment && attachmentType === "voice";
  const isFile = hasAttachment && attachmentType === "file";
  const canEdit = isMine && message.text && !isEncryptedText(message.text) && !hasAttachment;
  const remoteUrl = hasAttachment ? mediaUrl(attachment.url) : "";
  const attachmentDuration = Number(attachment?.duration) || 0;
  const attachmentSizeText = formatFileSize(attachment?.size);
  const encryptedMedia = isEncryptedAttachment(attachment);
  const shouldAutoCache = hasAttachment && attachment.size > 0 && attachment.size <= AUTO_CACHE_LIMIT && (isPhoto || isAudio);
  const {
    localUrl,
    isOfflineSaved,
    saveOffline
  } = useOfflineMedia({
    attachment,
    remoteUrl,
    shouldAutoCache: shouldAutoCache || encryptedMedia,
    decryptBlob: encryptedMedia ? blob => decryptAttachmentBlobForChat({
      username,
      chatKey: activeChat,
      attachment,
      blob
    }) : null
  });
  const fileUrl = encryptedMedia ? localUrl : localUrl || remoteUrl;
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
    let cancelled = false;
    async function updateText() {
      const value = await decryptTextForChat({
        username,
        chatKey: activeChat,
        text: message.text || ""
      });
      if (!cancelled) {
        setDecryptedText(value);
      }
    }
    updateText();
    return () => {
      cancelled = true;
    };
  }, [username, activeChat, message.text, e2eeRevision]);
  useEffect(() => {
    if (attachment?.width && attachment?.height) {
      setVideoRatio(`${attachment.width} / ${attachment.height}`);
    }
    if (attachmentDuration) {
      setVideoDuration(attachmentDuration);
      setAudioDuration(attachmentDuration);
    }
  }, [attachment?.width, attachment?.height, attachmentDuration, setAudioDuration]);
  function requestDeleteMessage(e) {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    closeMenus();
    setDeleteForEveryone(false);
    setDeleteConfirmOpen(true);
  }
  function cancelDeleteMessage() {
    window.__liotanModalEscHandledAt = Date.now();
    setDeleteConfirmOpen(false);
    setDeleteForEveryone(false);
  }
  function confirmDeleteMessage() {
    setDeleteConfirmOpen(false);
    onDelete?.(message, {
      forEveryone: deleteForEveryone
    });
    setDeleteForEveryone(false);
  }
  useEffect(() => {
    if (!deleteConfirmOpen) {
      document.body.classList.remove("liotan-delete-modal-open");
      return undefined;
    }
    document.body.classList.add("liotan-delete-modal-open");
    return () => {
      document.body.classList.remove("liotan-delete-modal-open");
    };
  }, [deleteConfirmOpen]);
  useEffect(() => {
    if (!deleteConfirmOpen) {
      return undefined;
    }
    function handleDeleteConfirmEsc(e) {
      if (e.key !== "Escape") {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();
      window.__liotanModalEscHandledAt = Date.now();
      setDeleteConfirmOpen(false);
      setDeleteForEveryone(false);
    }
    window.addEventListener("keydown", handleDeleteConfirmEsc, true);
    return () => {
      window.removeEventListener("keydown", handleDeleteConfirmEsc, true);
    };
  }, [deleteConfirmOpen]);
  function renderStatus() {
    if (!isMine) {
      return null;
    }
    const status = message.status || "sent";
    if (status === "read") {
      return <span className="message-status read">
          ✓✓
        </span>;
    }
    if (status === "delivered") {
      return <span className="message-status delivered">
          ✓✓
        </span>;
    }
    return <span className="message-status sent">
        ✓
      </span>;
  }
  function renderTimeLayer() {
    return <div className="photo-time-layer">
        {formatTime(message.createdAt)}
        {renderStatus()}
      </div>;
  }
  function renderMessageTime(className = "") {
    if (isPhoto || isVideo) {
      return null;
    }
    return <MessageTime time={formatTime(message.createdAt)} edited={message.edited} status={renderStatus()} className={className} />;
  }
  function renderMediaCaption() {
    if (!decryptedText) {
      return null;
    }
    return <div className="message-media-caption">
        {renderTextWithLinks(decryptedText)}
      </div>;
  }
  async function downloadFile() {
    const sourceUrl = localUrl || fileUrl || remoteUrl;
    if (!sourceUrl) {
      return;
    }
    try {
      if (hasAttachment && !isOfflineSaved && remoteUrl) {
        await saveOffline();
      }
      const response = await fetch(sourceUrl);
      if (!response.ok) {
        throw new Error("Download failed");
      }
      const remoteBlob = await response.blob();
      const blob = encryptedMedia && !localUrl ? await decryptAttachmentBlobForChat({
        username,
        chatKey: activeChat,
        attachment,
        blob: remoteBlob
      }) : remoteBlob;
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = safeDownloadName(attachment.name);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {}
  }
  function requestDownloadFile() {
    setDownloadConfirmOpen(true);
  }
  function copyMessage() {
    if (decryptedText) {
      navigator.clipboard?.writeText(decryptedText);
    }
    closeMenus();
  }
  function toggleAudio() {
    if ((!isAudio && !isVoice) || !attachment?.url) {
      return;
    }
    const playlist = audioMessages.map(item => ({
      messageId: item._id,
      url: item.attachment.url,
      name: item.attachment.type === "voice" ? t.voiceMessage || "Голосовое сообщение" : item.attachment.name || t.audio || "Аудио",
      duration: Number(item.attachment.duration) || 0,
      size: item.attachment.size || 0
    }));
    window.dispatchEvent(new CustomEvent("liotan:play-audio", {
      detail: {
        messageId: message._id,
        url: fileUrl || attachment.url,
        name: isVoice ? t.voiceMessage || "Голосовое сообщение" : attachment.name || t.audio || "Аудио",
        duration: audioDuration || attachmentDuration,
        size: attachment.size || 0,
        playlist
      }
    }));
  }
  function seekAudio(e) {
    const nextTime = Number(e.target.value);
    setAudioProgress(nextTime);
    window.dispatchEvent(new CustomEvent("liotan:seek-audio", {
      detail: {
        messageId: message._id,
        time: nextTime
      }
    }));
  }
  function handleVideoMetadata(e) {
    const video = e.currentTarget;
    if (video.videoWidth && video.videoHeight) {
      setVideoRatio(`${video.videoWidth} / ${video.videoHeight}`);
    }
    if (Number.isFinite(video.duration)) {
      setVideoDuration(video.duration);
    }
  }
  const otherDeleteUser = isMine ? message.to : message.from;
  const canDeleteForEveryone = message.chatType === "group" ? isMine : Boolean(otherDeleteUser && otherDeleteUser !== username);
  const deleteForEveryoneLabel = message.chatType === "group" ? t.alsoDeleteForAll || "Также удалить для всех" : `${t.alsoDeleteFor || "Также удалить для"} ${otherDeleteUser}`;
  function renderDeleteConfirmModal() {
    if (!deleteConfirmOpen) {
      return null;
    }
    return createPortal(<div className="dialog-delete-modal-overlay message-delete-modal-overlay" onClick={cancelDeleteMessage}>
        <div className="dialog-delete-modal message-delete-modal" onClick={e => e.stopPropagation()}>
          <div className="dialog-delete-modal-title">
            {t.deleteMessage || "Удалить сообщение"}
          </div>

          <div className="dialog-delete-modal-text">
            {t.deleteMessageConfirm || "Вы точно хотите удалить это сообщение?"}
          </div>

          {canDeleteForEveryone && <label className="dialog-delete-checkbox-row">
              <span className="dialog-delete-checkbox">
                <input type="checkbox" checked={deleteForEveryone} onChange={e => setDeleteForEveryone(e.target.checked)} />

                <span className="dialog-delete-checkbox-box" />
              </span>

              <span>
                {deleteForEveryoneLabel}
              </span>
            </label>}

          <div className="dialog-delete-modal-actions">
            <button type="button" className="dialog-delete-modal-cancel" onClick={cancelDeleteMessage}>
              {t.cancel || "Отмена"}
            </button>

            <button type="button" className="dialog-delete-modal-danger" onClick={confirmDeleteMessage}>
              {t.delete || "Удалить"}
            </button>
          </div>
        </div>
      </div>, document.body);
  }
  function renderDesktopMenu() {
    if (!menuOpen) {
      return null;
    }
    return createPortal(<div ref={menuRef} className="message-menu telegram-action-menu" style={{
      top: `${menuPos.top}px`,
      left: `${menuPos.left}px`
    }}>
        <MessageActions t={t} message={message} hasAttachment={hasAttachment} canEdit={canEdit} closeMenus={closeMenus} copyMessage={copyMessage} downloadFile={requestDownloadFile} onReply={onReply} onEdit={onEdit} onDelete={requestDeleteMessage} onPin={onPin} />
      </div>, document.body);
  }
  function renderPhoto() {
    return <div className="message-photo-wrap" onClick={openViewer}>
        {fileUrl ? <img src={fileUrl} alt={attachment.name || ""} className="message-photo" /> : <div className="message-encrypted-media-placeholder">
            {t.decryptingMedia || "Расшифровка медиа..."}
          </div>}

        {renderMediaCaption()}
        {renderTimeLayer()}
      </div>;
  }
  function renderVideo() {
    const needsManualDownload = attachment.size > AUTO_CACHE_LIMIT && !isOfflineSaved;
    return <div className="message-video-wrap" onClick={() => isOfflineSaved || !needsManualDownload ? openViewer() : downloadFile()} style={{
      "--video-ratio": videoRatio
    }}>
        {fileUrl ? <video src={fileUrl} className="message-video" preload="metadata" muted playsInline loop onLoadedMetadata={handleVideoMetadata} /> : <div className="message-encrypted-media-placeholder">
            {t.decryptingVideo || "Расшифровка видео..."}
          </div>}

        <button type="button" className="message-video-play" aria-label={t.openVideo || "Открыть видео"} />

        <div className="video-duration-layer">
          {formatDuration(videoDuration)}
        </div>

        {needsManualDownload && <button type="button" className="video-download-layer" onClick={e => {
        e.stopPropagation();
        downloadFile();
      }}>
            ↓ {formatFileSize(attachment.size)}
          </button>}

        {renderMediaCaption()}
        {renderTimeLayer()}
      </div>;
  }
  return <>
      <div ref={messageRef} data-message-id={message._id} data-audio-message-id={isAudio || isVoice ? message._id : undefined} className={["message", isMine ? "me" : "", isPhoto ? "photo-message" : "", isVideo ? "video-message" : "", isAudio ? "audio-message" : "", isVoice ? "voice-message" : "", isFile ? "file-message" : "", !hasAttachment ? "text-message" : "", menuOpen ? "menu-open" : ""].join(" ")} onContextMenu={handleContextMenu} onTouchStart={handleTouchStart} onTouchEnd={clearLongPress} onTouchMove={clearLongPress} onTouchCancel={clearLongPress}>
        <MessageReply message={message} t={t} username={username} activeChat={activeChat} e2eeRevision={e2eeRevision} />

        {isPhoto && renderPhoto()}

        {isVideo && renderVideo()}

        <div className="message-content">
          {isAudio && <MessageAudio attachment={attachment} audioPlaying={audioPlaying} audioStarted={audioStarted} audioProgress={audioProgress} audioDuration={audioDuration} attachmentSizeText={attachmentSizeText} footer={renderMessageTime("message-footer-compact")} onToggle={toggleAudio} onSeek={seekAudio} />}

          {isVoice && <MessageVoice t={t} audioPlaying={audioPlaying} audioStarted={audioStarted} audioProgress={audioProgress} audioDuration={audioDuration} footer={renderMessageTime("message-footer-compact")} onToggle={toggleAudio} onSeek={seekAudio} />}

          {isFile && <MessageFile attachment={attachment} t={t} footer={renderMessageTime("message-footer-compact")} onDownloadRequest={requestDownloadFile} />}

          {decryptedText && !isPhoto && !isVideo && <MessageText value={decryptedText} footer={!hasAttachment ? renderMessageTime("message-footer-inline") : null} />}
        </div>

        {hasAttachment && !isPhoto && !isVideo && !isAudio && !isVoice && !isFile && renderMessageTime("message-footer-block")}
      </div>

      {renderDesktopMenu()}

      {renderDeleteConfirmModal()}

      {mobileMenu && <div className="mobile-action-overlay" onClick={closeMenus}>
          <div className="mobile-action-sheet" onClick={e => e.stopPropagation()}>
            <MessageActions t={t} message={message} hasAttachment={hasAttachment} canEdit={canEdit} closeMenus={closeMenus} copyMessage={copyMessage} downloadFile={requestDownloadFile} onReply={onReply} onEdit={onEdit} onDelete={requestDeleteMessage} onPin={onPin} />
          </div>
        </div>}

      <MessageViewer open={viewerOpen} attachment={attachment || {}} fileUrl={fileUrl} isPhoto={isPhoto} isVideo={isVideo} videoRatio={videoRatio} onClose={closeViewer} onDownload={downloadFile} onVideoMetadata={handleVideoMetadata} />

      <DownloadConfirmModal open={downloadConfirmOpen} fileName={attachment?.name} fileSize={attachment?.size} onCancel={() => setDownloadConfirmOpen(false)} onConfirm={() => {
      setDownloadConfirmOpen(false);
      downloadFile();
    }} />
    </>;
}
export default memo(Message);
