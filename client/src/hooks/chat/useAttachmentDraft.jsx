import {
  useEffect,
  useRef,
  useState
} from "react";

export function useAttachmentDraft({
  sendAttachment,
  sendAttachments,
  setAttachMenuOpen
}) {

  const draftRef =
    useRef([]);

  const [
    attachmentDraft,
    setAttachmentDraft
  ] = useState([]);

  const [
    attachmentCaption,
    setAttachmentCaption
  ] = useState("");

  const [
    sendingDraft,
    setSendingDraft
  ] = useState(false);

  useEffect(() => {
    draftRef.current =
      attachmentDraft;
  }, [
    attachmentDraft
  ]);

  useEffect(() => {
    return () => {
      draftRef.current.forEach(item =>
        URL.revokeObjectURL(item.url)
      );
    };
  }, []);

  function isDraftFile(file) {
    return Boolean(file);
  }

  function getDraftType(file) {
    if (file.type.startsWith("image/")) {
      return "photo";
    }

    if (file.type.startsWith("video/")) {
      return "video";
    }

    if (file.type.startsWith("audio/")) {
      return "audio";
    }

    return "file";
  }

  function createDraftItems(files) {
    return Array
      .from(files)
      .filter(isDraftFile)
      .slice(0, 10)
      .map(file => ({
        file,
        type: getDraftType(file),
        url: URL.createObjectURL(file),
        name: file.name || "Файл",
        size: file.size || 0,
        mimeType: file.type || "",
        width: 0,
        height: 0,
        ratio: "",
        orientation: ""
      }));
  }

  function addDraftFiles(files) {
    const nextItems =
      createDraftItems(files);

    if (!nextItems.length) {
      return;
    }

    setAttachmentDraft(prev => {
      const available =
        Math.max(
          0,
          10 - prev.length
        );

      return [
        ...prev,
        ...nextItems.slice(
          0,
          available
        )
      ];
    });
  }

  function updateDraftMediaMeta(
    index,
    meta
  ) {
    setAttachmentDraft(prev =>
      prev.map((item, currentIndex) => {
        if (currentIndex !== index) {
          return item;
        }

        const width =
          Number(meta?.width) || 0;

        const height =
          Number(meta?.height) || 0;

        const ratio =
          width > 0 && height > 0
            ? `${width} / ${height}`
            : "";

        let orientation = "";

        if (width && height) {
          if (width > height * 1.15) {
            orientation = "landscape";
          } else if (height > width * 1.15) {
            orientation = "portrait";
          } else {
            orientation = "square";
          }
        }

        return {
          ...item,
          width,
          height,
          ratio,
          orientation
        };
      })
    );
  }

  function closeAttachmentDraft() {
    attachmentDraft.forEach(item =>
      URL.revokeObjectURL(item.url)
    );

    setAttachmentDraft([]);
    setAttachmentCaption("");
    setSendingDraft(false);
  }

  function removeDraftItem(index) {
    setAttachmentDraft(prev => {
      const item =
        prev[index];

      if (item) {
        URL.revokeObjectURL(item.url);
      }

      return prev.filter(
        (_, i) => i !== index
      );
    });
  }

  async function sendAttachmentDraft() {
    if (
      sendingDraft ||
      !attachmentDraft.length
    ) {
      return;
    }

    setSendingDraft(true);

    const ok =
      await sendAttachments(
        attachmentDraft.map(item => item.file),
        attachmentCaption
      );

    if (ok !== false) {
      closeAttachmentDraft();
      return;
    }

    setSendingDraft(false);
  }

  function handlePaste(e) {
    const files =
      Array.from(
        e.clipboardData?.files || []
      );

    const mediaFiles =
      files.filter(isDraftFile);

    if (!mediaFiles.length) {
      return;
    }

    e.preventDefault();

    addDraftFiles(mediaFiles);
  }

  function handlePhotoChange(e) {
    const files =
      e.target.files;

    if (!files?.length) {
      return;
    }

    addDraftFiles(files);

    e.target.value = "";
    setAttachMenuOpen(false);
  }

  function handleFileChange(e) {
    const files =
      e.target.files;

    if (!files?.length) {
      return;
    }

    addDraftFiles(files);

    e.target.value = "";
    setAttachMenuOpen(false);
  }

  return {
    attachmentDraft,
    attachmentCaption,
    setAttachmentCaption,
    sendingDraft,
    closeAttachmentDraft,
    removeDraftItem,
    sendAttachmentDraft,
    updateDraftMediaMeta,
    handlePaste,
    handlePhotoChange,
    handleFileChange
  };

}