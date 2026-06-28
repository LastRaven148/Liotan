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
  fileUrl,
  t
}) {
  const fileName =
    attachment.name || t.file || "Файл";

  const fileKind =
    getFileKind(fileName);

  const fileLabel =
    getFileLabel(fileName);

  return (
    <a
      className="message-file"
      href={fileUrl}
      target="_blank"
      rel="noreferrer"
      download={fileName}
      onClick={(e) =>
        e.stopPropagation()
      }
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
    </a>
  );
}