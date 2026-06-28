export default function MessageActions({
  t,
  message,
  hasAttachment,
  canEdit,
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
        <span>↩</span>
        {t.reply || "Ответить"}
      </button>

      {message.text && (
        <button
          type="button"
          onClick={copyMessage}
        >
          <span>⧉</span>
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
          <span>✎</span>
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
          <span>↓</span>
          Скачать
        </button>
      )}

      <button
        type="button"
        onClick={fakeAction}
      >
        <span>↗</span>
        Переслать
      </button>

      <button
        type="button"
        onClick={fakeAction}
      >
        <span>✓</span>
        Выбрать
      </button>

      <button
        type="button"
        onClick={() => {
          closeMenus();
          onPin?.(message);
        }}
      >
        <span>⌖</span>

        {message.isPinned
          ? "Открепить"
          : "Закрепить"}
      </button>

      <button
        type="button"
        className="danger"
        onClick={() => {
          closeMenus();
          onDelete(message);
        }}
      >
        <span>×</span>
        {t.delete || "Удалить"}
      </button>
    </>
  );
}