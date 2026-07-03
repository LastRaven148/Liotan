import { useLanguage } from "../../context/LanguageContext";
import LiotanIcon from "../common/LiotanIcon";

function MenuIconSlot({ name }) {
  return (
    <span className="telegram-menu-icon" aria-hidden="true">
      <LiotanIcon name={name} size={21} />
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
  const { t } = useLanguage();

  return (
    <div className="telegram-menu compact-menu" ref={menuRef}>
      <button
        className="telegram-menu-item"
        type="button"
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
        type="button"
        onClick={() => {
          closeProfileMenu();
          openChat(username);
          setShowArchive(false);
        }}
      >
        <MenuIconSlot name="star" />
        {t.savedMessages}
      </button>

      <button
        className="telegram-menu-item"
        type="button"
        onClick={() => {
          setShowArchive(!showArchive);
          closeProfileMenu();
        }}
      >
        <MenuIconSlot name="archive" />
        {showArchive ? t.search : t.archive}
      </button>
    </div>
  );
}
