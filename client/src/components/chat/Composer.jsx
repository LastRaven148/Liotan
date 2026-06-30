import {
  useEffect,
  useRef
} from "react";

import {
  getMessagePreview
} from "./chatUtils";

import {
  formatDuration
} from "./message/messageFormatters";

import useVoiceRecorder from "../../hooks/chat/useVoiceRecorder";

function GalleryIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="3" stroke="currentColor" strokeWidth="2" />
      <circle cx="8" cy="10" r="1.7" fill="currentColor" />
      <path d="M5.5 17L10 12.5L13.2 15.7L15.2 13.7L19 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
      <path d="M7 3.5H14.5L19 8V20.5H7C5.9 20.5 5 19.6 5 18.5V5.5C5 4.4 5.9 3.5 7 3.5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M14 3.8V8.5H18.7" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M8.5 13H15.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M8.5 16.5H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="2" />
      <path d="M5 11C5 15 8 18 12 18C16 18 19 15 19 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 18V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function VoiceWave() {
  return (
    <div className="voice-record-wave" aria-hidden="true">
      {Array.from({ length: 18 }).map((_, index) => (
        <span
          key={index}
          style={{
            "--voice-bar": `${8 + ((index * 13) % 22)}px`
          }}
        />
      ))}
    </div>
  );
}

function AttachMenu({
  t,
  photoInputRef,
  fileInputRef,
  closeMenu
}) {
  return (
    <div className="attach-menu">
      <button type="button" onClick={() => { closeMenu?.(); photoInputRef.current?.click(); }}>
        <span className="attach-menu-icon"><GalleryIcon /></span>
        <span className="attach-menu-label">{t.photoOrVideo || "Фото или видео"}</span>
      </button>

      <button type="button" onClick={() => { closeMenu?.(); fileInputRef.current?.click(); }}>
        <span className="attach-menu-icon"><FileIcon /></span>
        <span className="attach-menu-label">{t.file || "Файл"}</span>
      </button>
    </div>
  );
}

export default function Composer({
  t,
  text,
  setText,
  canSend,
  textareaRef,
  photoInputRef,
  fileInputRef,
  attachMenuOpen,
  setAttachMenuOpen,
  editingMessage,
  cancelEditMessage,
  replyMessage,
  cancelReplyMessage,
  onPaste,
  onPhotoChange,
  onFileChange,
  onSendClick,
  onKeyDown,
  onSendVoice
}) {
  const attachWrapperRef = useRef(null);

  const {
    isRecording,
    recordingSeconds,
    recordingError,
    sendingVoice,
    startRecording,
    stopRecording,
    cancelRecording
  } = useVoiceRecorder({
    onSendVoice
  });

  useEffect(() => {
    if (!attachMenuOpen) return undefined;

    function handlePointerDown(e) {
      if (attachWrapperRef.current?.contains(e.target)) return;
      setAttachMenuOpen(false);
    }

    function handleKeyDown(e) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setAttachMenuOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [attachMenuOpen, setAttachMenuOpen]);

  function handleTextChange(e) {
    setText(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
  }

  return (
    <div className="composer-shell">
      {replyMessage && !editingMessage && (
        <div className="reply-panel">
          <div className="reply-panel-content">
            <div className="reply-panel-title">
              {t.replyingTo} {replyMessage.from}
            </div>
            <div className="reply-panel-text">
              {getMessagePreview(replyMessage, t)}
            </div>
          </div>
          <button type="button" className="reply-panel-close" onClick={cancelReplyMessage}>×</button>
        </div>
      )}

      {recordingError && (
        <div className="voice-record-error">
          {recordingError}
        </div>
      )}

      {isRecording && (
        <div className="voice-record-panel">
          <button type="button" className="voice-record-cancel" onClick={cancelRecording}>
            Отмена
          </button>
          <span className="voice-record-dot" />
          <span className="voice-record-time">{formatDuration(recordingSeconds)}</span>
          <VoiceWave />
          <button type="button" className="voice-record-send" onClick={stopRecording}>➤</button>
        </div>
      )}

      <div className={["composer", isRecording ? "is-voice-recording" : ""].filter(Boolean).join(" ")}>
        {editingMessage && (
          <div className="edit-banner">
            <div>
              <div className="edit-banner-title">{t.editingMessage}</div>
              <div className="edit-banner-text">{editingMessage.text}</div>
            </div>
            <button type="button" onClick={cancelEditMessage}>×</button>
          </div>
        )}

        <div className="attach-wrapper" ref={attachWrapperRef}>
          <button type="button" className="attach-button" onClick={() => setAttachMenuOpen(prev => !prev)}>+</button>
          {attachMenuOpen && <AttachMenu t={t} photoInputRef={photoInputRef} fileInputRef={fileInputRef} closeMenu={() => setAttachMenuOpen(false)} />}
          <input ref={photoInputRef} type="file" hidden multiple accept="image/*,video/*" onChange={onPhotoChange} />
          <input ref={fileInputRef} type="file" hidden multiple onChange={onFileChange} />
        </div>

        <textarea
          ref={textareaRef}
          value={text}
          onPaste={onPaste}
          onChange={handleTextChange}
          onKeyDown={onKeyDown}
          placeholder={editingMessage ? t.editMessage : t.message}
          rows={1}
        />

        {canSend ? (
          <button type="button" className="send-button" onClick={onSendClick} disabled={!canSend || sendingVoice}>➤</button>
        ) : (
          <button
            type="button"
            className="send-button voice-button"
            onClick={startRecording}
            disabled={sendingVoice || isRecording || Boolean(editingMessage)}
            title={t.voiceMessage || "Голосовое сообщение"}
          >
            <MicIcon />
          </button>
        )}
      </div>
    </div>
  );
}
