import FileIcon
from "./FileIcon";

import {
  formatFileSize
} from "./messageFormatters";

import {
  getFileKind,
  getFileLabel
} from "./messageFileUtils";

export default function MessageFile({
  attachment,
  t,
  onDownloadRequest
}) {
  const fileName =
    attachment.name || t.file || "Файл";

  const fileKind =
    getFileKind(fileName);

  const fileLabel =
    getFileLabel(fileName);

  return (
    <button
      type="button"
      className="message-file"
      onClick={(e) => {
        e.stopPropagation();
        onDownloadRequest?.();
      }}
    >
      <div
        className={[
          "message-file-icon",
          `file-kind-${fileKind}`
        ].join(" ")}
      >
        <FileIcon />

        <span className="message-file-label">
          {fileLabel}
        </span>
      </div>

      <div className="message-file-info">
        <div className="message-file-name">
          {fileName}
        </div>

        <div className="message-file-size">
          {formatFileSize(attachment.size)}
        </div>
      </div>
    </button>
  );
}