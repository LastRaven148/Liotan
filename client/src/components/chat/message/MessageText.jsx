export default function MessageText({
  value
}) {
  function renderTextWithLinks(text) {
    const parts =
      text.split(
        /(https?:\/\/[^\s]+)/g
      );

    return parts.map((part, index) => {
      if (
        part.startsWith("http://") ||
        part.startsWith("https://")
      ) {
        return (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noreferrer"
            className="message-link"
            onClick={(e) =>
              e.stopPropagation()
            }
            onContextMenu={(e) =>
              e.stopPropagation()
            }
          >
            {part}
          </a>
        );
      }

      return part;
    });
  }

  if (!value) {
    return null;
  }

  return (
    <div className="message-text">
      {renderTextWithLinks(value)}
    </div>
  );
}

export function renderTextWithLinks(value) {
  if (!value) {
    return null;
  }

  const parts =
    value.split(
      /(https?:\/\/[^\s]+)/g
    );

  return parts.map((part, index) => {
    if (
      part.startsWith("http://") ||
      part.startsWith("https://")
    ) {
      return (
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noreferrer"
          className="message-link"
          onClick={(e) =>
            e.stopPropagation()
          }
          onContextMenu={(e) =>
            e.stopPropagation()
          }
        >
          {part}
        </a>
      );
    }

    return part;
  });
}