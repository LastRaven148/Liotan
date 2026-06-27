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

  function isPreviewMedia(file) {
    return (
      file.type.startsWith("image/") ||
      file.type.startsWith("video/")
    );
  }

  function getDraftType(file) {
    if (file.type.startsWith("video/")) {
      return "video";
    }

    return "photo";
  }

  function createDraftItems(files) {
    return Array
      .from(files)
      .filter(isPreviewMedia)
      .slice(0, 10)
      .map(file => ({
        file,
        type: getDraftType(file),
        url: URL.createObjectURL(file),
        ratio: ""
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
        Math.max(0, 10 - prev.length);

      return [
        ...prev,
        ...nextItems.slice(0, available)
      ];
    });
  }

  function updateDraftRatio(index, ratio) {
    setAttachmentDraft(prev =>
      prev.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              ratio
            }
          : item
      )
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

    try {
      const ok =
        await sendAttachments(
          attachmentDraft.map(item => item.file),
          attachmentCaption
        );

      if (ok === false) {
        setSendingDraft(false);
        return;
      }

      closeAttachmentDraft();
    } catch (err) {
      console.error(err);
      setSendingDraft(false);
    }
  }

  function handlePaste(e) {
    const files =
      Array.from(
        e.clipboardData?.files || []
      );

    const mediaFiles =
      files.filter(isPreviewMedia);

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
    const file =
      e.target.files?.[0];

    if (!file) {
      return;
    }

    sendAttachment(file);

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
    updateDraftRatio,
    sendAttachmentDraft,
    handlePaste,
    handlePhotoChange,
    handleFileChange
  };

}