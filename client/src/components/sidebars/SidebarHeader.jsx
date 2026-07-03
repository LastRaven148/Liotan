import { useLanguage } from "../../context/LanguageContext";
import LiotanIcon from "../common/LiotanIcon";

export default function SidebarHeader({
  search,
  setSearch,
  profileMenu,
  setProfileMenu,
  showArchive
}) {
  const { t } = useLanguage();

  return (
    <div className="sidebar-top">
      <button
        className="burger-button liotan-icon-button"
        onClick={() => setProfileMenu(!profileMenu)}
        aria-label="Open menu"
        type="button"
      >
        <LiotanIcon name="burger" size={23} />
      </button>

      <div className="sidebar-search">
        <span className="sidebar-search-icon" aria-hidden="true">
          <LiotanIcon name="search" size={20} />
        </span>
        <input
          placeholder={showArchive ? t.archive : t.search}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
    </div>
  );
}
