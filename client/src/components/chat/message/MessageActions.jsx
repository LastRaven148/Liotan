import LiotanIcon from "../../common/LiotanIcon";

function MenuIcon({ name }) {
  const iconName = name === "delete" ? "trash" : name;
  return <LiotanIcon name={iconName} size={21} />;
}
function IconSlot({ name }) {
  return (
    <span className="menu-icon" aria-hidden="true">
      <MenuIcon name={name} />
    </span>
  );
}

export default function MessageActions({
  t,
  message,
  hasAttachment,
  canEdit,
  canCopy = Boolean(message.text),
  closeMenus,
  copyMessage,
  downloadFile,
  onReply,
  onEdit,
  onDelete,
  onPin
}) {
  function fakeAction() {
    closeMenus();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          closeMenus();
          onReply(message);
        }}
      >
        <IconSlot name="reply" />
        {t.reply || "Ответить"}
      </button>

      {canCopy && (
        <button
          type="button"
          onClick={copyMessage}
        >
          <IconSlot name="copy" />
          Скопировать
        </button>
      )}

      {canEdit && (
        <button
          type="button"
          onClick={() => {
            closeMenus();
            onEdit(message);
          }}
        >
          <IconSlot name="edit" />
          {t.edit || "Изменить"}
        </button>
      )}

      {hasAttachment && (
        <button
          type="button"
          onClick={() => {
            closeMenus();
            downloadFile();
          }}
        >
          <IconSlot name="download" />
          Скачать
        </button>
      )}


      <button
        type="button"
        onClick={fakeAction}
      >
        <IconSlot name="select" />
        Выбрать
      </button>

      <button
        type="button"
        onClick={() => {
          closeMenus();
          onPin?.(message);
        }}
      >
        <IconSlot name={message.isPinned ? "unpin" : "pin"} />

        {message.isPinned
          ? "Открепить"
          : "Закрепить"}
      </button>

      <button
        type="button"
        className="danger"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDelete?.();
        }}
      >
        <IconSlot name="delete" />
        {t.delete || "Удалить"}
      </button>
    </>
  );
}
