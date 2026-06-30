import {
  useEffect,
  useState
} from "react";

function getDraftTitle(items) {
  if (items.length === 1) {
    const item = items[0];
    if (item.type === "video") return "Отправить 1 видео";
    if (item.type === "photo") return "Отправить 1 фото";
    if (item.type === "audio") return "Отправить 1 аудио";
    return "Отправить 1 файл";
  }

  return `Отправить ${items.length} вложений`;
}

function formatFileSize(value = 0) {
  const size = Number(value) || 0;
  if (size < 1024) return `${size} Б`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} КБ`;
  return `${(size / 1024 / 1024).toFixed(1)} МБ`;
}

function getExtension(name = "") {
  const clean = String(name || "");
  const index = clean.lastIndexOf(".");
  return index >= 0 ? clean.slice(index + 1).toUpperCase() : "FILE";
}

function getItemClass(item) {
  const base = ["attachment-preview-item"];
  if (item.type === "video") base.push("attachment-preview-video-item");
  if (item.type === "photo") base.push("attachment-preview-photo-item");
  if (["audio", "file"].includes(item.type)) base.push("attachment-preview-file-item");
  if (item.orientation) base.push(`attachment-preview-${item.orientation}`);
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
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(e) {
      if (!attachmentDraft.length || e.key !== "Escape") return;

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();
      window.__liotanModalEscHandledAt = Date.now();

      if (!sendingDraft) onClose?.();
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [attachmentDraft.length, sendingDraft, onClose]);

  if (!attachmentDraft.length) return null;

  const onlyFiles = attachmentDraft.every(item => !["photo", "video"].includes(item.type));

  return (
    <div
      className="attachment-preview-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !sendingDraft) onClose?.();
      }}
    >
      <div className={["attachment-preview-modal", onlyFiles ? "is-file-preview" : "is-media-preview"].join(" ")}>
        <div className="attachment-preview-header">
          <button type="button" className="attachment-preview-close" onClick={onClose}>×</button>
          <div className="attachment-preview-title">{getDraftTitle(attachmentDraft)}</div>
          <div className="attachment-preview-menu-wrap">
            <button type="button" className="attachment-preview-more" onClick={() => setMenuOpen(prev => !prev)}>⋮</button>

            {menuOpen && (
              <div className="attachment-preview-menu">
                <button type="button" onClick={() => { setMenuOpen(false); onAddMore?.(); }}>
                  <span className="attachment-preview-menu-icon">+</span>
                  <span>Добавить</span>
                </button>
                <button type="button" onClick={() => setMenuOpen(false)}>
                  <span className="attachment-preview-menu-icon">✓</span>
                  <span>Отправить без сжатия</span>
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
              style={item.ratio ? { "--draft-media-ratio": item.ratio } : undefined}
            >
              {item.type === "video" ? (
                <video
                  src={item.url}
                  controls
                  playsInline
                  preload="metadata"
                  className="attachment-preview-video"
                  onLoadedMetadata={(e) => {
                    const video = e.currentTarget;
                    if (video.videoWidth && video.videoHeight) onMediaMeta?.(index, { width: video.videoWidth, height: video.videoHeight });
                  }}
                />
              ) : item.type === "photo" ? (
                <img
                  src={item.url}
                  alt=""
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    if (img.naturalWidth && img.naturalHeight) onMediaMeta?.(index, { width: img.naturalWidth, height: img.naturalHeight });
                  }}
                />
              ) : (
                <div className="attachment-preview-file-card">
                  <div className={`attachment-preview-file-icon ext-${getExtension(item.name).toLowerCase()}`}>{getExtension(item.name)}</div>
                  <div className="attachment-preview-file-main">
                    <div className="attachment-preview-file-name">{item.name || "Файл"}</div>
                    <div className="attachment-preview-file-meta">{item.mimeType || "Файл"} · {formatFileSize(item.size)}</div>
                  </div>
                  <button
                    type="button"
                    className="attachment-preview-file-remove"
                    onClick={() => onRemove(index)}
                    aria-label="Удалить файл"
                  />
                </div>
              )}

              {["photo", "video"].includes(item.type) && (
                <button type="button" className="attachment-preview-remove" onClick={() => onRemove(index)}>×</button>
              )}
            </div>
          ))}
        </div>

        <div className="attachment-preview-caption">
          <input
            value={attachmentCaption}
            onChange={(e) => setAttachmentCaption(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!sendingDraft) onSend?.();
              }
            }}
            placeholder="Добавить подпись..."
          />
          <button type="button" className="attachment-preview-send" onClick={onSend} disabled={sendingDraft}>{sendingDraft ? "…" : "➤"}</button>
        </div>
      </div>
    </div>
  );
}
