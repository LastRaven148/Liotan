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

  function createDraftItems(files) {

    return Array
      .from(files)
      .filter(file =>
        file.type.startsWith("image/")
      )
      .slice(0, 10)
      .map(file => ({
        file,
        url:
          URL.createObjectURL(file)
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
        (_, i) =>
          i !== index
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

    await sendAttachments(
      attachmentDraft.map(item => item.file),
      attachmentCaption
    );

    closeAttachmentDraft();

  }

  function handlePaste(e) {

    const files =
      Array.from(
        e.clipboardData?.files || []
      );

    const imageFiles =
      files.filter(file =>
        file.type.startsWith("image/")
      );

    if (!imageFiles.length) {
      return;
    }

    e.preventDefault();

    addDraftFiles(imageFiles);

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
    sendAttachmentDraft,
    handlePaste,
    handlePhotoChange,
    handleFileChange
  };

}