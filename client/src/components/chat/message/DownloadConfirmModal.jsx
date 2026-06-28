import {
  createPortal
} from "react-dom";

import {
  formatFileSize
} from "./messageFormatters";

export default function DownloadConfirmModal({
  open,
  fileName,
  fileSize,
  onCancel,
  onConfirm
}) {
  if (!open) {
    return null;
  }

  return createPortal(
    <div
      className="download-confirm-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onCancel?.();
        }
      }}
    >
      <div className="download-confirm-modal">
        <div className="download-confirm-title">
          Скачать файл?
        </div>

        <div className="download-confirm-text">
          Вы уверены, что хотите скачать этот файл?
        </div>

        <div className="download-confirm-file">
          <div className="download-confirm-file-icon">
            ↓
          </div>

          <div className="download-confirm-file-info">
            <div className="download-confirm-file-name">
              {fileName || "Файл"}
            </div>

            <div className="download-confirm-file-size">
              {formatFileSize(fileSize)}
            </div>
          </div>
        </div>

        <div className="download-confirm-actions">
          <button
            type="button"
            className="download-confirm-cancel"
            onClick={onCancel}
          >
            Отмена
          </button>

          <button
            type="button"
            className="download-confirm-primary"
            onClick={onConfirm}
          >
            Да, хочу
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}