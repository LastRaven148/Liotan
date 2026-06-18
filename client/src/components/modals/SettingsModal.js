import {
  useState
} from "react";

import { avatarUrl }
from "../../utils/avatarUrl";

import {
  useLanguage
} from "../../context/LanguageContext";

export default function SettingsModal({
  username,
  avatar,
  bio,
  saveBio,
  uploadAvatar,
  onClose
}) {

  const {
    t,
    language,
    setLanguage
  } = useLanguage();

  const [
    editing,
    setEditing
  ] = useState(false);

  const [
    value,
    setValue
  ] = useState(bio || "");

  function handleSave() {
    saveBio(value);
    setEditing(false);
  }

  function toggleLanguage() {
    setLanguage(
      language === "en"
        ? "ru"
        : "en"
    );
  }

  return (
    <div
      className="drawer-overlay drawer-overlay-left"
      onClick={onClose}
    >
      <aside
        className="settings-drawer"
        onClick={(e) =>
          e.stopPropagation()
        }
      >
        <div className="drawer-topbar">
          <button
            type="button"
            className="drawer-icon-button"
            onClick={
              editing
                ? () => setEditing(false)
                : onClose
            }
          >
            ←
          </button>

          <div className="drawer-title">
            {editing
              ? t.editProfile
              : t.settings}
          </div>

          {editing ? (
            <button
              type="button"
              className="drawer-save-button"
              onClick={handleSave}
            >
              {t.save}
            </button>
          ) : (
            <button
              type="button"
              className="drawer-icon-button"
              onClick={() =>
                setEditing(true)
              }
            >
              ✎
            </button>
          )}
        </div>

        {editing ? (
          <>
            <label className="edit-avatar">
              <div className="settings-avatar large">
                {avatar ? (
                  <img
                    src={avatarUrl(avatar)}
                    alt=""
                    className="avatar-image"
                  />
                ) : (
                  username
                    .charAt(0)
                    .toUpperCase()
                )}
              </div>

              <div className="edit-avatar-badge">
                📷
              </div>

              <input
                type="file"
                hidden
                accept="image/*"
                onChange={uploadAvatar}
              />
            </label>

            <div className="settings-card">
              <div className="settings-field-label">
                {t.username}
              </div>

              <div className="settings-readonly">
                {username}
              </div>

              <div className="settings-field-label">
                {t.bio}
              </div>

              <textarea
                className="settings-bio-input"
                value={value}
                onChange={(e) =>
                  setValue(e.target.value)
                }
                placeholder={t.aboutYou}
                maxLength={100}
              />
            </div>
          </>
        ) : (
          <>
            <div className="settings-profile">
              <div className="settings-avatar">
                {avatar ? (
                  <img
                    src={avatarUrl(avatar)}
                    alt=""
                    className="avatar-image"
                  />
                ) : (
                  username
                    .charAt(0)
                    .toUpperCase()
                )}
              </div>

              <div className="settings-name">
                {username}
              </div>

              <div className="settings-online">
                {t.online}
              </div>
            </div>

            <div className="settings-card">
              <div className="settings-row">
                <span>@</span>

                <div>
                  <div className="settings-row-main">
                    {username}
                  </div>

                  <div className="settings-row-sub">
                    {t.username}
                  </div>
                </div>
              </div>

              {bio?.trim() && (
                <div className="settings-row">
                  <span>i</span>

                  <div>
                    <div className="settings-row-main">
                      {bio}
                    </div>

                    <div className="settings-row-sub">
                      {t.bio}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="settings-card">
              <button
                type="button"
                className="settings-row button-row"
                onClick={toggleLanguage}
              >
                <span>🌐</span>

                <div className="settings-row-main">
                  {t.language}
                </div>

                <div className="settings-row-value">
                  {language === "en"
                    ? t.english
                    : t.russian}
                </div>
              </button>
            </div>
          </>
        )}
      </aside>
    </div>
  );

}