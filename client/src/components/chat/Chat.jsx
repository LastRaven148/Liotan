import ChatHeader from "./ChatHeader";
import PinnedBar from "./PinnedBar";
import AttachmentDraftModal from "./AttachmentDraftModal";
import MessageList from "./MessageList";
import Composer from "./Composer";

import {
  memo,
  useRef,
  useState
} from "react";

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
    handlePaste,
    handlePhotoChange,
    handleFileChange
  } = useAttachmentDraft({
    sendAttachment,
    sendAttachments,
    setAttachMenuOpen,
    updateDraftRatio
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

  useChatScroll({
    activeChat,
    messages,
    messagesRef
  });

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

          <PinnedBar
            message={activePinnedMessage}
            t={t}
            onClick={handlePinnedBarClick}
          />

          <MessageList
            messages={messages}
            t={t}
            username={username}
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
        </>
      ) : (
        <div className="empty">
          {t.selectChat}
        </div>
      )}

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
        onVideoRatio={updateDraftRatio}
      />

    </div>
  );

});

export default Chat;