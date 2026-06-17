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

function getReplyPreview(
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
    return t.photo;
  }

  if (message.attachment?.type === "file") {
    return message.attachment.name || t.file;
  }

  return t.message;

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
  handleKey,
  sendMessage,
  sendAttachment,
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

  const [
    attachMenuOpen,
    setAttachMenuOpen
  ] = useState(false);

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
                    {getReplyPreview(
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
                      📷 {t.photo}
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        fileInputRef.current?.click()
                      }
                    >
                      📄 {t.file}
                    </button>

                  </div>
                )}

                <input
                  ref={photoInputRef}
                  type="file"
                  hidden
                  accept="image/*"
                  onChange={handleFileChange}
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
                onKeyDown={handleKey}
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

    </div>
  );

});

export default Chat;