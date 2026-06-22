import Message from "./Message";
import ChatHeader from "./ChatHeader";

import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

import {
  useLanguage
} from "../../context/LanguageContext";

function isSameDay(a, b) {

  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );

}

function getDateLabel(
  value,
  t
) {

  const date =
    new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const now =
    new Date();

  const yesterday =
    new Date();

  yesterday.setDate(
    yesterday.getDate() - 1
  );

  if (isSameDay(date, now)) {
    return t.today;
  }

  if (isSameDay(date, yesterday)) {
    return t.yesterday;
  }

  return date.toLocaleDateString(
    [],
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }
  );

}

function buildMessagesWithDates(
  messages,
  t
) {

  const result = [];
  let lastDateKey = "";

  for (const message of messages) {

    const date =
      new Date(message.createdAt);

    if (Number.isNaN(date.getTime())) {
      result.push({
        type: "message",
        message
      });

      continue;
    }

    const dateKey =
      `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

    if (dateKey !== lastDateKey) {
      result.push({
        type: "date",
        id: `date-${dateKey}`,
        label:
          getDateLabel(
            message.createdAt,
            t
          )
      });

      lastDateKey =
        dateKey;
    }

    result.push({
      type: "message",
      message
    });

  }

  return result;

}

function getMessagePreview(
  message,
  t
) {

  if (!message) {
    return "";
  }

  if (message.text) {
    return message.text;
  }

  if (message.attachment?.type === "photo") {
    return t.photo || "Фото";
  }

  if (message.attachment?.type === "file") {
    return message.attachment.name || t.file || "Файл";
  }

  return t.message || "Сообщение";

}

const Chat = memo(function Chat({
  activeChat,
  activeDialog,
  onlineUsers,
  typingUsers,
  messages,
  username,
  text,
  setText,
  editingMessage,
  cancelEditMessage,
  startEditMessage,
  replyMessage,
  startReplyMessage,
  cancelReplyMessage,
  deleteMessage,
  pinMessage,
  handleKey,
  sendMessage,
  sendAttachment,
  sendAttachments,
  onBack,
  openProfile
}) {

  const { t } =
    useLanguage();

  const bottomRef =
    useRef(null);

  const textareaRef =
    useRef(null);

  const messagesRef =
    useRef(null);

  const photoInputRef =
    useRef(null);

  const fileInputRef =
    useRef(null);

  const draftRef =
    useRef([]);

  const [
    attachMenuOpen,
    setAttachMenuOpen
  ] = useState(false);

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

  const [
    activePinnedIndex,
    setActivePinnedIndex
  ] = useState(0);

  const canSend =
    Boolean(
      text.trim() ||
      editingMessage
    );

  const items =
    useMemo(() => {

      return buildMessagesWithDates(
        messages,
        t
      );

    }, [
      messages,
      t
    ]);

  const pinnedMessages =
    useMemo(() => {

      return [...messages]
        .filter(message =>
          message.isPinned
        )
        .sort((a, b) =>
          new Date(b.pinnedAt || b.createdAt) -
          new Date(a.pinnedAt || a.createdAt)
        );

    }, [
      messages
    ]);

  const activePinnedMessage =
    pinnedMessages[
      activePinnedIndex
    ] || pinnedMessages[0] || null;

  useEffect(() => {

    if (
      activePinnedIndex >
      pinnedMessages.length - 1
    ) {
      setActivePinnedIndex(0);
    }

  }, [
    activePinnedIndex,
    pinnedMessages.length
  ]);

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

  useEffect(() => {

    if (
      !messages.length ||
      !messagesRef.current
    ) {
      return;
    }

    messagesRef.current.scrollTop =
      messagesRef.current.scrollHeight;

  }, [messages]);

  useEffect(() => {

    if (
      text === "" &&
      textareaRef.current
    ) {
      textareaRef.current.style.height =
        "48px";
    }

  }, [text]);

  useEffect(() => {

    if (
      (editingMessage || replyMessage) &&
      textareaRef.current
    ) {
      textareaRef.current.focus();
    }

  }, [
    editingMessage,
    replyMessage
  ]);

  function scrollToMessage(message) {

    if (
      !message ||
      !messagesRef.current
    ) {
      return;
    }

    const el =
      messagesRef.current.querySelector(
        `[data-message-id="${message._id}"]`
      );

    if (!el) {
      return;
    }

    el.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });

    el.classList.add(
      "message-highlight"
    );

    setTimeout(() => {
      el.classList.remove(
        "message-highlight"
      );
    }, 1200);

  }

  function showPrevPinned(e) {

    e.stopPropagation();

    if (!pinnedMessages.length) {
      return;
    }

    setActivePinnedIndex(prev =>
      prev <= 0
        ? pinnedMessages.length - 1
        : prev - 1
    );

  }

  function showNextPinned(e) {

    e.stopPropagation();

    if (!pinnedMessages.length) {
      return;
    }

    setActivePinnedIndex(prev =>
      prev >= pinnedMessages.length - 1
        ? 0
        : prev + 1
    );

  }

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

  function handleSendClick() {

    if (!canSend) {
      return;
    }

    sendMessage();

    if (textareaRef.current) {
      textareaRef.current.style.height =
        "48px";
    }

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

  return (
    <div className="chat">

      {activeChat ? (
        <>
          <ChatHeader
            activeChat={activeChat}
            activeDialog={activeDialog}
            onlineUsers={onlineUsers}
            typingUsers={typingUsers}
            openProfile={openProfile}
            username={username}
            onBack={onBack}
          />

          {activePinnedMessage && (
            <div className="pinned-bar-wrap">
              <button
                type="button"
                className="pinned-bar"
                onClick={() =>
                  scrollToMessage(
                    activePinnedMessage
                  )
                }
              >
                <div className="pinned-bar-line" />

                <div className="pinned-bar-content">
                  <div className="pinned-bar-title">
                    Закреплённое сообщение{" "}
                    {pinnedMessages.length > 1
                      ? `${activePinnedIndex + 1}/${pinnedMessages.length}`
                      : ""}
                  </div>

                  <div className="pinned-bar-text">
                    {getMessagePreview(
                      activePinnedMessage,
                      t
                    )}
                  </div>
                </div>
              </button>

              {pinnedMessages.length > 1 && (
                <div className="pinned-bar-controls">
                  <button
                    type="button"
                    onClick={showPrevPinned}
                  >
                    ↑
                  </button>

                  <button
                    type="button"
                    onClick={showNextPinned}
                  >
                    ↓
                  </button>
                </div>
              )}
            </div>
          )}

          <div
            className="messages"
            ref={messagesRef}
          >

            {items.map((item) => {

              if (item.type === "date") {
                return (
                  <div
                    key={item.id}
                    className="date-separator"
                  >
                    {item.label}
                  </div>
                );
              }

              return (
                <Message
                  key={item.message._id}
                  message={item.message}
                  username={username}
                  onEdit={startEditMessage}
                  onReply={startReplyMessage}
                  onDelete={deleteMessage}
                  onPin={pinMessage}
                />
              );

            })}

            <div ref={bottomRef} />

          </div>

          <div className="composer-shell">

            {replyMessage && !editingMessage && (
              <div className="reply-panel">

                <div className="reply-panel-content">
                  <div className="reply-panel-title">
                    {t.replyingTo} {replyMessage.from}
                  </div>

                  <div className="reply-panel-text">
                    {getMessagePreview(
                      replyMessage,
                      t
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  className="reply-panel-close"
                  onClick={cancelReplyMessage}
                >
                  ×
                </button>

              </div>
            )}

            <div className="composer">

              {editingMessage && (
                <div className="edit-banner">
                  <div>
                    <div className="edit-banner-title">
                      {t.editingMessage}
                    </div>

                    <div className="edit-banner-text">
                      {editingMessage.text}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={cancelEditMessage}
                  >
                    ×
                  </button>
                </div>
              )}

              <div className="attach-wrapper">

                <button
                  type="button"
                  className="attach-button"
                  onClick={() =>
                    setAttachMenuOpen(
                      prev => !prev
                    )
                  }
                >
                  +
                </button>

                {attachMenuOpen && (
                  <div className="attach-menu">

                    <button
                      type="button"
                      onClick={() =>
                        photoInputRef.current?.click()
                      }
                    >
                      {t.photo}
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        fileInputRef.current?.click()
                      }
                    >
                      {t.file}
                    </button>

                  </div>
                )}

                <input
                  ref={photoInputRef}
                  type="file"
                  hidden
                  multiple
                  accept="image/*"
                  onChange={handlePhotoChange}
                />

                <input
                  ref={fileInputRef}
                  type="file"
                  hidden
                  onChange={handleFileChange}
                />

              </div>

              <textarea
                ref={textareaRef}
                value={text}
                onPaste={handlePaste}
                onChange={(e) => {

                  setText(
                    e.target.value
                  );

                  e.target.style.height =
                    "auto";

                  const newHeight =
                    Math.min(
                      e.target.scrollHeight,
                      160
                    );

                  e.target.style.height =
                    `${newHeight}px`;

                }}
                onKeyDown={handleComposerKeyDown}
                placeholder={
                  editingMessage
                    ? t.editMessage
                    : t.message
                }
                rows={1}
              />

              <button
                type="button"
                className="send-button"
                onClick={handleSendClick}
                disabled={!canSend}
              >
                ➤
              </button>

            </div>

          </div>
        </>
      ) : (
        <div className="empty">
          {t.selectChat}
        </div>
      )}

      {attachmentDraft.length > 0 && (
        <div className="attachment-preview-overlay">
          <div className="attachment-preview-modal">

            <div className="attachment-preview-header">
              <button
                type="button"
                className="attachment-preview-close"
                onClick={closeAttachmentDraft}
              >
                ×
              </button>

              <div className="attachment-preview-title">
                {attachmentDraft.length === 1
                  ? "Отправить 1 фото"
                  : `Отправить ${attachmentDraft.length} фото`}
              </div>

              <button
                type="button"
                className="attachment-preview-more"
              >
                ⋮
              </button>
            </div>

            <div className="attachment-preview-list">
              {attachmentDraft.map((item, index) => (
                <div
                  key={item.url}
                  className="attachment-preview-item"
                >
                  <img
                    src={item.url}
                    alt=""
                  />

                  <button
                    type="button"
                    className="attachment-preview-remove"
                    onClick={() =>
                      removeDraftItem(index)
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <div className="attachment-preview-footer">
              <button
                type="button"
                className="attachment-preview-add"
                onClick={() =>
                  photoInputRef.current?.click()
                }
                disabled={
                  attachmentDraft.length >= 10
                }
              >
                +
              </button>

              <input
                value={attachmentCaption}
                onChange={(e) =>
                  setAttachmentCaption(
                    e.target.value
                  )
                }
                placeholder="Добавить подпись..."
              />

              <button
                type="button"
                className="attachment-preview-send"
                onClick={sendAttachmentDraft}
                disabled={sendingDraft}
              >
                ➤
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );

});

export default Chat;