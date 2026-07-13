import {
  useLayoutEffect,
  useRef,
  useState
} from "react";

export function renderTextWithLinks(text = "") {
  return text.split(/(https?:\/\/[^\s]+)/g).map((part, index) => {
    if (/^https?:\/\//.test(part)) {
      return (
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noreferrer"
          className="message-link"
        >
          {part}
        </a>
      );
    }

    return part;
  });
}

function getLastUsableRect(rects) {
  const list = Array.from(rects || [])
    .filter(rect => rect.width > 0 && rect.height > 0);

  if (!list.length) {
    return null;
  }

  return list[list.length - 1];
}

export default function MessageText({
  value,
  footer = null
}) {
  const rootRef =
    useRef(null);

  const textRef =
    useRef(null);

  const footerRef =
    useRef(null);

  const [footerMode, setFooterMode] =
    useState("inline");

  useLayoutEffect(() => {
    if (!footer) {
      return undefined;
    }

    const root =
      rootRef.current;

    const textNode =
      textRef.current;

    const footerNode =
      footerRef.current;

    if (
      !root ||
      !textNode ||
      !footerNode
    ) {
      return undefined;
    }

    let rafId = 0;

    function updateFooterPosition() {
      window.cancelAnimationFrame(rafId);

      rafId = window.requestAnimationFrame(() => {
        const range =
          document.createRange();

        range.selectNodeContents(textNode);

        const rects =
          range.getClientRects();

        const lastRect =
          getLastUsableRect(rects);

        range.detach?.();

        if (!lastRect) {
          setFooterMode("inline");
          return;
        }

        const rootRect =
          root.getBoundingClientRect();

        const footerRect =
          footerNode.getBoundingClientRect();

        const footerWidth =
          Math.ceil(footerRect.width);

        const gap =
          8;

        const availableOnLastLine =
          Math.floor(rootRect.right - lastRect.right);

        const isSingleLine =
          Array.from(rects || [])
            .filter(rect => rect.width > 0 && rect.height > 0)
            .length <= 1;

        if (isSingleLine) {
          setFooterMode(availableOnLastLine >= footerWidth + gap ? "right" : "line");
          return;
        }

        if (availableOnLastLine >= footerWidth + gap) {
          setFooterMode("right");
          return;
        }

        setFooterMode("line");
      });
    }

    updateFooterPosition();

    const resizeObserver =
      new ResizeObserver(updateFooterPosition);

    resizeObserver.observe(root);
    resizeObserver.observe(textNode);
    resizeObserver.observe(footerNode);

    window.addEventListener(
      "resize",
      updateFooterPosition
    );

    return () => {
      window.cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      window.removeEventListener(
        "resize",
        updateFooterPosition
      );
    };
  }, [
    value,
    footer
  ]);

  return (
    <div
      ref={rootRef}
      className={[
        "message-text",
        footer ? "message-text-with-footer" : "",
        footer ? `message-text-footer-${footerMode}` : ""
      ].filter(Boolean).join(" ")}
    >
      <span
        ref={textRef}
        className="message-text-content"
      >
        {renderTextWithLinks(value)}
      </span>

      {footer && (
        <span
          ref={footerRef}
          className="message-text-footer-slot"
        >
          {footer}
        </span>
      )}
    </div>
  );
}
