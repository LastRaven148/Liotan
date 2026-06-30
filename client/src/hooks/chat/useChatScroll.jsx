import {
  useLayoutEffect,
  useRef
} from "react";

const chatScrollState =
  new Map();

function getScrollState(el) {
  return {
    top: el.scrollTop,
    distanceFromBottom:
      el.scrollHeight - el.scrollTop - el.clientHeight
  };
}

function saveChatScroll(chatId, el) {
  if (!chatId || !el) {
    return;
  }

  chatScrollState.set(
    chatId,
    getScrollState(el)
  );
}

function scrollToBottom(el) {
  if (!el) {
    return;
  }

  el.scrollTop =
    el.scrollHeight;
}

function restoreChatScroll(chatId, el) {
  if (!chatId || !el) {
    return false;
  }

  const saved =
    chatScrollState.get(chatId);

  if (!saved) {
    return false;
  }

  const nextTop =
    Math.max(
      0,
      el.scrollHeight - el.clientHeight - saved.distanceFromBottom
    );

  el.scrollTop = nextTop;

  return true;
}

export function useChatScroll({
  activeChat,
  messages,
  messagesRef
}) {

  const currentChatRef =
    useRef(null);

  const previousMessagesRef =
    useRef({
      length: 0,
      lastId: ""
    });

  const shouldStickToBottomRef =
    useRef(true);

  useLayoutEffect(() => {
    const el =
      messagesRef.current;

    if (!el || !activeChat) {
      return undefined;
    }

    function handleScroll() {
      const distanceFromBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight;

      shouldStickToBottomRef.current =
        distanceFromBottom < 80;

      saveChatScroll(
        activeChat,
        el
      );
    }

    el.addEventListener(
      "scroll",
      handleScroll,
      { passive: true }
    );

    handleScroll();

    return () => {
      saveChatScroll(
        activeChat,
        el
      );

      el.removeEventListener(
        "scroll",
        handleScroll
      );
    };
  }, [
    activeChat,
    messagesRef
  ]);

  useLayoutEffect(() => {
    const el =
      messagesRef.current;

    if (!el || !activeChat) {
      return;
    }

    const lastMessage =
      messages[messages.length - 1];

    const lastId =
      lastMessage?._id || "";

    const previous =
      previousMessagesRef.current;

    const previousChat =
      currentChatRef.current;

    const chatChanged =
      previousChat !== activeChat;

    const newMessageAdded =
      messages.length > previous.length &&
      lastId !== previous.lastId;

    if (chatChanged) {
      if (previousChat) {
        saveChatScroll(
          previousChat,
          el
        );
      }

      currentChatRef.current =
        activeChat;

      requestAnimationFrame(() => {
        const restored =
          restoreChatScroll(
            activeChat,
            el
          );

        if (!restored) {
          scrollToBottom(el);
        }
      });
    } else if (newMessageAdded) {
      if (shouldStickToBottomRef.current) {
        requestAnimationFrame(() => {
          scrollToBottom(el);
        });
      }
    } else {
      requestAnimationFrame(() => {
        restoreChatScroll(
          activeChat,
          el
        );
      });
    }

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
