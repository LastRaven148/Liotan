import LiotanIcon from "../../common/LiotanIcon";

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
        <span className="menu-icon" aria-hidden="true"><LiotanIcon name="reply" size={21} /></span>
        Ответить
      </button>

      {canEdit && (
        <button
          onClick={() => {
            onEdit();
            onClose();
          }}
        >
          <span className="menu-icon" aria-hidden="true"><LiotanIcon name="edit" size={21} /></span>
          Изменить
        </button>
      )}

      <button
        onClick={() => {
          onPin();
          onClose();
        }}
      >
        <span className="menu-icon" aria-hidden="true"><LiotanIcon name="pin" size={21} /></span>
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
          <span className="menu-icon" aria-hidden="true"><LiotanIcon name="trash" size={21} /></span>
          Удалить
        </button>
      )}

    </div>
  );

}