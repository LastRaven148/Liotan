import {
  useLanguage
} from "../../context/LanguageContext";

function MenuIcon({ name }) {
  const common = {
    width: "20",
    height: "20",
    viewBox: "0 0 24 24",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    "aria-hidden": "true"
  };

  if (name === "profile") {
    return (
      <svg {...common}>
        <circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M5.5 19.2c.75-3.35 3.1-5.1 6.5-5.1s5.75 1.75 6.5 5.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (name === "saved") {
    return (
      <svg {...common}>
        <path d="M12 3.9 14.45 8.85 19.9 9.65 15.95 13.5 16.9 18.9 12 16.35 7.1 18.9 8.05 13.5 4.1 9.65 9.55 8.85 12 3.9Z" stroke="currentColor" strokeWidth="1.65" strokeLinejoin="round" />
      </svg>
    );
  }

  if (name === "archive") {
    return (
      <svg {...common}>
        <path d="M5.3 8.1h13.4" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" />
        <path d="M6.7 8.1h10.6v10.2c0 1-.8 1.8-1.8 1.8h-7c-1 0-1.8-.8-1.8-1.8V8.1Z" stroke="currentColor" strokeWidth="1.65" strokeLinejoin="round" />
        <path d="M6.2 4.4h11.6l.9 3.7H5.3l.9-3.7Z" stroke="currentColor" strokeWidth="1.65" strokeLinejoin="round" />
        <path d="M12 11.3v4.2" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" />
        <path d="M9.9 13.7 12 15.8l2.1-2.1" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return null;
}

function MenuIconSlot({ name }) {
  return (
    <span className="telegram-menu-icon" aria-hidden="true">
      <MenuIcon name={name} />
    </span>
  );
}

export default function SidebarMenu({
  menuRef,
  username,
  closeProfileMenu,
  openSettings,
  openChat,
  showArchive,
  setShowArchive
}) {

  const { t } =
    useLanguage();

  return (
    <div
      className="telegram-menu compact-menu"
      ref={menuRef}
    >
      <button
        className="telegram-menu-item"
        onClick={() => {
          openSettings();
          closeProfileMenu();
        }}
      >
        <MenuIconSlot name="profile" />
        {t.myProfile || "Мой профиль"}
      </button>

      <button
        className="telegram-menu-item"
        onClick={() => {
          closeProfileMenu();
          openChat(username);
          setShowArchive(false);
        }}
      >
        <MenuIconSlot name="saved" />
        {t.savedMessages}
      </button>

      <button
        className="telegram-menu-item"
        onClick={() => {
          setShowArchive(!showArchive);
          closeProfileMenu();
        }}
      >
        <MenuIconSlot name="archive" />
        {showArchive
          ? t.search
          : t.archive}
      </button>
    </div>
  );

}
