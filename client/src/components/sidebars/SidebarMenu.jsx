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
        <path d="M7.2 5.2c0-.9.72-1.6 1.6-1.6h6.4c.88 0 1.6.7 1.6 1.6v15l-4.8-3-4.8 3v-15z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    );
  }

  if (name === "archive") {
    return (
      <svg {...common}>
        <path d="M5.2 8.2h13.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M6.4 8.2l.75 10.1c.08 1.05.95 1.9 2 1.9h5.7c1.05 0 1.92-.85 2-1.9l.75-10.1" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M6.2 4.3h11.6l1 3.9H5.2l1-3.9z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M12 11.2v4.7m0 0 2.05-2.05M12 15.9l-2.05-2.05" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
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
