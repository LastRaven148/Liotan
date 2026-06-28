export default function MessageTime({
  time,
  edited,
  status
}) {

  return (
    <div className="message-time">

      {edited && (
        <span className="message-edited">
          изменено
        </span>
      )}

      {time}

      {status}

    </div>
  );

}