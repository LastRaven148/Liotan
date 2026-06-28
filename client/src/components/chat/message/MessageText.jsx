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

export default function MessageText({
  value,
  children
}) {
  return (
    <div className="message-text">
  {renderTextWithLinks(value)}
  <span className="message-time-spacer" />
  {children}
</div>
  );
}