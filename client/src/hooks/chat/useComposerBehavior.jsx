import {
  useEffect
} from "react";

export function useComposerBehavior({
  text,
  editingMessage,
  replyMessage,
  textareaRef,
  handleKey,
  sendMessage
}) {

  const canSend =
    Boolean(
      text.trim() ||
      editingMessage
    );

  useEffect(() => {

    if (
      (editingMessage || replyMessage) &&
      textareaRef.current
    ) {
      textareaRef.current.focus();
    }

  }, [
    editingMessage,
    replyMessage,
    textareaRef
  ]);

  function handleSendClick() {

    if (!canSend) {
      return;
    }

    sendMessage();

  }

  function handleComposerKeyDown(e) {

    if (e.key !== "Enter") {
      handleKey(e);
      return;
    }

    if (e.shiftKey) {
      if (!e.currentTarget.value.trim()) {
        e.preventDefault();
        return;
      }

      return;
    }

    handleKey(e);

  }

  return {
    canSend,
    handleSendClick,
    handleComposerKeyDown
  };

}
