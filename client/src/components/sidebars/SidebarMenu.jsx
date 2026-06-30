import {
  useLanguage
} from "../../context/LanguageContext";

export default function SidebarMenu({
  menuRef,
  username,
  closeProfileMenu,
  openSettings,
  openChat,
  openCreateGroup,
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
        <span className="telegram-menu-icon" />
        {t.myProfile || "Мой профиль"}
      </button>

      <button
        className="telegram-menu-item"
        onClick={() => {
          openCreateGroup();
          closeProfileMenu();
        }}
      >
        <span className="telegram-menu-icon" />
        {t.createGroup || "Создать группу"}
      </button>

      <button
        className="telegram-menu-item"
        onClick={() => {
          closeProfileMenu();
          openChat(username);
          setShowArchive(false);
        }}
      >
        <span className="telegram-menu-icon" />
        {t.savedMessages}
      </button>

      <button
        className="telegram-menu-item"
        onClick={() => {
          setShowArchive(!showArchive);
          closeProfileMenu();
        }}
      >
        <span className="telegram-menu-icon" />
        {showArchive
          ? t.search
          : t.archive}
      </button>
    </div>
  );

}