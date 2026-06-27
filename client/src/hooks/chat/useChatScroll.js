import {
  useEffect,
  useRef
} from "react";

export function useChatScroll({
  activeChat,
  messages,
  messagesRef
}) {

  const previousChatRef =
    useRef(null);

  const previousMessagesRef =
    useRef({
      length: 0,
      lastId: ""
    });

  function scrollToBottom() {

    const el =
      messagesRef.current;

    if (!el) {
      return;
    }

    requestAnimationFrame(() => {
      el.scrollTop =
        el.scrollHeight;

      requestAnimationFrame(() => {
        el.scrollTop =
          el.scrollHeight;
      });
    });

  }

  useEffect(() => {

    const el =
      messagesRef.current;

    if (!el) {
      return;
    }

    const lastMessage =
      messages[messages.length - 1];

    const lastId =
      lastMessage?._id || "";

    const previous =
      previousMessagesRef.current;

    const chatChanged =
      previousChatRef.current !== activeChat;

    const newMessageAdded =
      messages.length > previous.length &&
      lastId !== previous.lastId;

    if (
      chatChanged ||
      newMessageAdded
    ) {
      scrollToBottom();
    }

    previousChatRef.current =
      activeChat;

    previousMessagesRef.current = {
      length: messages.length,
      lastId
    };

  }, [
    activeChat,
    messages,
    messagesRef
  ]);

}