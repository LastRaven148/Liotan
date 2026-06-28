export default function MessageTime({
  time,
  edited,
  status,
  className = ""
}) {
  return (
    <div
      className={[
        "message-footer",
        className
      ].filter(Boolean).join(" ")}
    >
      {edited && (
        <span className="message-edited">
          изменено
        </span>
      )}

      <span className="message-time-value">
        {time}
      </span>

      {status}
    </div>
  );
}
