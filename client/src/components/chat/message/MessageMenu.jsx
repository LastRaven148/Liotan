export default function MessageMenu({
  x,
  y,
  canEdit,
  canDelete,
  onReply,
  onEdit,
  onDelete,
  onPin,
  onClose
}) {

  return (
    <div
      className="message-menu telegram-action-menu"
      style={{
        left: x,
        top: y
      }}
    >

      <button
        onClick={() => {
          onReply();
          onClose();
        }}
      >
        <span>↩</span>
        Ответить
      </button>

      {canEdit && (
        <button
          onClick={() => {
            onEdit();
            onClose();
          }}
        >
          <span>✎</span>
          Изменить
        </button>
      )}

      <button
        onClick={() => {
          onPin();
          onClose();
        }}
      >
        <span>📌</span>
        Закрепить
      </button>

      {canDelete && (
        <button
          className="danger"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete?.();
          }}
        >
          <span className="menu-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M8.2 8.2H17.2" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" /><path d="M9.2 8.2V18C9.2 19.2 10 20.1 11.2 20.1H15.2C16.4 20.1 17.2 19.2 17.2 18V8.2" stroke="currentColor" strokeWidth="1.65" strokeLinejoin="round" /><path d="M11 11.3V17" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" /><path d="M14.9 11.3V17" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" /><path d="M10.6 8.1L13.9 4.8C14.5 4.2 15.5 4.2 16.1 4.8L17.9 6.6" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" /><path d="M6 4.6L12.5 11.1" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" /></svg></span>
          Удалить
        </button>
      )}

    </div>
  );

}