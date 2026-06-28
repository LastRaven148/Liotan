import FileIcon
from "./FileIcon";

import {
  formatFileSize
} from "./messageFormatters";

import {
  getFileKind,
  getFileLabel
} from "./messageFileUtils";

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

  const kind =
    getFileKind(fileName || "");

  const label =
    getFileLabel(fileName || "");

  return (
    <div className="download-confirm-overlay">
      <div className="download-confirm-modal">
        <div className="download-confirm-title">
          Скачать файл?
        </div>

        <div className="download-confirm-text">
          Вы уверены, что хотите скачать этот файл?
        </div>

        <div className="download-confirm-file">
          <div
            className={[
              "message-file-icon",
              `file-kind-${kind}`
            ].join(" ")}
          >
            <FileIcon />

            <span className="message-file-label">
              {label}
            </span>
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
    </div>
  );
}