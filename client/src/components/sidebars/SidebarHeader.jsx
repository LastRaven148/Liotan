import {
  useLanguage
} from "../../context/LanguageContext";

export default function SidebarHeader({
  search,
  setSearch,
  profileMenu,
  setProfileMenu,
  showArchive
}) {

  const { t } =
    useLanguage();

  return (
    <div className="sidebar-top">

      <button
        className="burger-button"
        onClick={() =>
          setProfileMenu(!profileMenu)
        }
        aria-label="Open menu"
      >
        ☰
      </button>

      <div className="sidebar-search">
        <input
          placeholder={
            showArchive
              ? t.archive
              : t.search
          }
          value={search}
          onChange={(e) =>
            setSearch(e.target.value)
          }
        />
      </div>

    </div>
  );

}