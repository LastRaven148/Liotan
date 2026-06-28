export function getFileExtension(name = "") {
  const parts =
    name.split(".");

  if (parts.length < 2) {
    return "";
  }

  return parts.pop().toLowerCase();
}

export function getFileKind(name = "") {
  const ext =
    getFileExtension(name);

  if (["pdf"].includes(ext)) return "pdf";
  if (["doc", "docx"].includes(ext)) return "doc";
  if (["xls", "xlsx"].includes(ext)) return "xls";
  if (["ppt", "pptx"].includes(ext)) return "ppt";
  if (["zip", "rar", "7z"].includes(ext)) return "zip";
  if (["txt", "md", "json", "js", "jsx", "css", "html"].includes(ext)) return "text";
  if (["exe", "msi", "apk"].includes(ext)) return "app";

  return "file";
}

export function getFileLabel(name = "") {
  const kind =
    getFileKind(name);

  if (kind === "pdf") return "PDF";
  if (kind === "doc") return "DOC";
  if (kind === "xls") return "XLS";
  if (kind === "ppt") return "PPT";
  if (kind === "zip") return "ZIP";
  if (kind === "text") return "TXT";
  if (kind === "app") return "APP";

  const ext =
    getFileExtension(name);

  return ext
    ? ext.toUpperCase().slice(0, 4)
    : "FILE";
}