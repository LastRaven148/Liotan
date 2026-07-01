function MenuIcon({ name }) {
  const common = {
    width: "18",
    height: "18",
    viewBox: "0 0 24 24",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    "aria-hidden": "true"
  };

  switch (name) {
    case "reply":
      return (
        <svg {...common}>
          <path d="M10 7L5 12L10 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M6 12H14.5C17.6 12 20 14.4 20 17.5V18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "copy":
      return (
        <svg {...common}>
          <rect x="9" y="8" width="10" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
          <path d="M6 16H5.5C4.7 16 4 15.3 4 14.5V5.5C4 4.7 4.7 4 5.5 4H14.5C15.3 4 16 4.7 16 5.5V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "edit":
      return (
        <svg {...common}>
          <path d="M4 20H8.5L18.7 9.8C19.6 8.9 19.6 7.5 18.7 6.6L17.4 5.3C16.5 4.4 15.1 4.4 14.2 5.3L4 15.5V20Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M13.5 6L18 10.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "download":
      return (
        <svg {...common}>
          <path d="M12 4V14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M8 10L12 14L16 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M5 19H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "select":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" />
          <path d="M8.5 12.2L10.8 14.5L15.8 9.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "pin":
      return (
        <svg {...common}>
          <path d="M15.5 4.5L19.5 8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M14.8 5.2L9.8 10.2L7 10.6L6.2 11.4L12.6 17.8L13.4 17L13.8 14.2L18.8 9.2L14.8 5.2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M10.5 15.5L5 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "unpin":
      return (
        <svg {...common}>
          <path d="M15.5 4.5L19.5 8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M14.8 5.2L9.8 10.2L7 10.6L6.2 11.4L12.6 17.8L13.4 17L13.8 14.2L18.8 9.2L14.8 5.2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M10.5 15.5L5 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M4 4L20 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "delete":
      return (
        <svg {...common}>
          <path d="M5 7H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M10 11V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M14 11V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M8 7L8.7 19C8.8 20.1 9.7 21 10.8 21H13.2C14.3 21 15.2 20.1 15.3 19L16 7" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M9.5 7V5.5C9.5 4.7 10.2 4 11 4H13C13.8 4 14.5 4.7 14.5 5.5V7" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
    default:
      return null;
  }
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
