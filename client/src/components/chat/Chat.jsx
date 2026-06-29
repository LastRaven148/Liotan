import ChatHeader from "./ChatHeader";
import PinnedBar from "./PinnedBar";
import AttachmentDraftModal from "./AttachmentDraftModal";
import MessageList from "./MessageList";
import Composer from "./Composer";

import {
  memo,
  useEffect,
  useRef,
  useState
} from "react";

import {
  hasChatSecret,
  setChatSecret
} from "../../utils/e2ee";

import {
  useLanguage
} from "../../context/LanguageContext";

import {
  usePinnedMessages
} from "../../hooks/chat/usePinnedMessages";

import {
  useAttachmentDraft
} from "../../hooks/chat/useAttachmentDraft";

import {
  useChatScroll
} from "../../hooks/chat/useChatScroll";

import {
  useComposerBehavior
} from "../../hooks/chat/useComposerBehavior";

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

  const [
    attachMenuOpen,
    setAttachMenuOpen
  ] = useState(false);

  const [
    e2eeRevision,
    setE2eeRevision
  ] = useState(0);

  const {
    activePinnedMessage,
    handlePinnedBarClick
  } = usePinnedMessages({
    messages,
    activeChat,
    messagesRef
  });

  const {
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
  } = useAttachmentDraft({
    sendAttachment,
    sendAttachments,
    setAttachMenuOpen
  });

  const {
    canSend,
    handleSendClick,
    handleComposerKeyDown
  } = useComposerBehavior({
    text,
    editingMessage,
    replyMessage,
    textareaRef,
    handleKey,
    sendMessage
  });

  const [cachedChat, setCachedChat] =
    useState(null);

  useEffect(() => {
    if (!activeChat) {
      return;
    }

    setCachedChat({
      activeChat,
      activeDialog,
      messages
    });
  }, [
    activeChat,
    activeDialog,
    messages
  ]);

  const renderedActiveChat =
    activeChat || cachedChat?.activeChat || null;

  const renderedActiveDialog =
    activeChat
      ? activeDialog
      : cachedChat?.activeDialog || null;

  const renderedMessages =
    activeChat
      ? messages
      : cachedChat?.messages || [];

  const chatVisible =
    Boolean(activeChat);

  const e2eeEnabled =
    Boolean(
      renderedActiveChat &&
      hasChatSecret(username, renderedActiveChat)
    );

  useEffect(() => {
    function handleE2EEUpdated() {
      setE2eeRevision(value => value + 1);
    }

    window.addEventListener(
      "liotan:e2ee-updated",
      handleE2EEUpdated
    );

    return () => {
      window.removeEventListener(
        "liotan:e2ee-updated",
        handleE2EEUpdated
      );
    };
  }, []);

  function handleE2EESettings() {
    if (!renderedActiveChat) {
      return;
    }

    const currentEnabled =
      hasChatSecret(username, renderedActiveChat);

    const value = window.prompt(
      currentEnabled
        ? "E2EE включено. Введите новый общий ключ или оставьте пустым, чтобы выключить:"
        : "Введите общий ключ E2EE для этого чата. Такой же ключ должен быть у собеседника:",
      ""
    );

    if (value === null) {
      return;
    }

    setChatSecret(
      username,
      renderedActiveChat,
      value
    );
  }

  useChatScroll({
    activeChat: renderedActiveChat,
    messages: renderedMessages,
    messagesRef
  });

  return (
    <div className="chat">

      {renderedActiveChat ? (
        <div
          className={[
            "chat-content",
            chatVisible ? "is-active" : "is-hidden"
          ].join(" ")}
          aria-hidden={chatVisible ? undefined : "true"}
        >
          <ChatHeader
            activeChat={renderedActiveChat}
            activeDialog={renderedActiveDialog}
            onlineUsers={onlineUsers}
            typingUsers={typingUsers}
            openProfile={openProfile}
            username={username}
            onBack={onBack}
            e2eeEnabled={e2eeEnabled}
            onE2EESettings={handleE2EESettings}
          />

          <PinnedBar
            message={activePinnedMessage}
            t={t}
            onClick={handlePinnedBarClick}
          />

          <MessageList
            messages={renderedMessages}
            t={t}
            username={username}
            activeChat={renderedActiveChat}
            e2eeRevision={e2eeRevision}
            messagesRef={messagesRef}
            bottomRef={bottomRef}
            onEdit={startEditMessage}
            onReply={startReplyMessage}
            onDelete={deleteMessage}
            onPin={pinMessage}
          />

          <Composer
            t={t}
            text={text}
            setText={setText}
            canSend={canSend}
            textareaRef={textareaRef}
            photoInputRef={photoInputRef}
            fileInputRef={fileInputRef}
            attachMenuOpen={attachMenuOpen}
            setAttachMenuOpen={setAttachMenuOpen}
            editingMessage={editingMessage}
            cancelEditMessage={cancelEditMessage}
            replyMessage={replyMessage}
            cancelReplyMessage={cancelReplyMessage}
            onPaste={handlePaste}
            onPhotoChange={handlePhotoChange}
            onFileChange={handleFileChange}
            onSendClick={handleSendClick}
            onKeyDown={handleComposerKeyDown}
          />
        </div>
      ) : null}

      {!chatVisible ? (
        <div className="empty">
          {t.selectChat}
        </div>
      ) : null}

      <AttachmentDraftModal
        attachmentDraft={attachmentDraft}
        attachmentCaption={attachmentCaption}
        setAttachmentCaption={setAttachmentCaption}
        sendingDraft={sendingDraft}
        onClose={closeAttachmentDraft}
        onRemove={removeDraftItem}
        onSend={sendAttachmentDraft}
        onAddMore={() =>
          photoInputRef.current?.click()
        }
        onMediaMeta={updateDraftMediaMeta}
      />

    </div>
  );

});

export default Chat;