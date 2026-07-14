import Message from "./Message";

import {
  useMemo
} from "react";

import {
  buildMessagesWithDates
} from "./chatUtils";

export default function MessageList({
  messages,
  t,
  username,
  activeChat,
  e2eeRevision,
  messagesRef,
  bottomRef,
  onEdit,
  onReply,
  onDelete,
  onPin
}) {

  const audioMessages =
    useMemo(() => {

      return messages.filter(item =>
        ["audio", "voice"].includes(item?.attachment?.type) &&
        item?.attachment?.url
      );

    }, [
      messages
    ]);

  const autoMediaIds =
    useMemo(() => {
      const candidates = messages.filter(item =>
        item?.attachment?.url &&
        ["photo", "video", "audio", "voice"].includes(item?.attachment?.type)
      );

      return new Set(
        candidates
          .slice(-24)
          .map(item => item._id)
      );
    }, [messages]);

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

  return (
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
            activeChat={activeChat}
            e2eeRevision={e2eeRevision}
            audioMessages={audioMessages}
            onEdit={onEdit}
            onReply={onReply}
            onDelete={onDelete}
            onPin={onPin}
            autoLoadMedia={
              item.message.status === "sending" ||
              autoMediaIds.has(item.message._id)
            }
          />
        );

      })}

      <div ref={bottomRef} />

    </div>
  );

}
