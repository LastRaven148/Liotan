import {
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

export function usePinnedMessages({
  messages,
  activeChat,
  messagesRef
}) {

  const highlightTimerRef =
    useRef(null);

  const [
    pinnedCycleIndex,
    setPinnedCycleIndex
  ] = useState(0);

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
    pinnedMessages[0] || null;

  useEffect(() => {

    setPinnedCycleIndex(0);

  }, [
    activeChat,
    pinnedMessages.length
  ]);

  useEffect(() => {

    return () => {

      if (highlightTimerRef.current) {
        clearTimeout(
          highlightTimerRef.current
        );
      }

    };

  }, []);

  function scrollToMessage(message) {

    if (
      !message ||
      !messagesRef.current
    ) {
      return;
    }

    const elements =
      Array.from(
        messagesRef.current.querySelectorAll(
          "[data-message-id]"
        )
      );

    const el =
      elements.find(item =>
        item.getAttribute("data-message-id") === message._id
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

    if (highlightTimerRef.current) {
      clearTimeout(
        highlightTimerRef.current
      );
    }

    highlightTimerRef.current =
      setTimeout(() => {
        el.classList.remove(
          "message-highlight"
        );
      }, 2500);

  }

  function handlePinnedBarClick() {

    if (!pinnedMessages.length) {
      return;
    }

    const message =
      pinnedMessages[pinnedCycleIndex] ||
      pinnedMessages[0];

    if (!message) {
      return;
    }

    scrollToMessage(message);

    setPinnedCycleIndex(prev => {

      const next =
        prev + 1;

      return next >= pinnedMessages.length
        ? 0
        : next;

    });

  }

  return {
    activePinnedMessage,
    handlePinnedBarClick
  };

}