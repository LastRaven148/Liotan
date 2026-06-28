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
          onClick={() => {
            onDelete();
            onClose();
          }}
        >
          <span>🗑</span>
          Удалить
        </button>
      )}

    </div>
  );

}