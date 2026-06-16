import {
  useLanguage
} from "../../context/LanguageContext";

export default function SidebarMenu({
  menuRef,
  username,
  closeProfileMenu,
  openSettings,
  openChat,
  showArchive,
  setShowArchive,
  logout
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
          closeProfileMenu();
          openChat(username);
          setShowArchive(false);
        }}
      >
        <span>★</span>
        {t.savedMessages}
      </button>

      <button
        className="telegram-menu-item"
        onClick={() => {
          setShowArchive(!showArchive);
          closeProfileMenu();
        }}
      >
        <span>▣</span>
        {showArchive
          ? t.search
          : t.archive}
      </button>

      <button
        className="telegram-menu-item"
        onClick={() => {
          openSettings();
          closeProfileMenu();
        }}
      >
        <span>⚙</span>
        {t.settings}
      </button>

      <button
        className="telegram-menu-item danger"
        onClick={() => {
          closeProfileMenu();
          logout();
        }}
      >
        <span>⎋</span>
        {t.logout}
      </button>

    </div>
  );

}