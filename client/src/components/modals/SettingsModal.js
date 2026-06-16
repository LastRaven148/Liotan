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

  if (editing) {
    return (
      <div
        className="modal-overlay"
        onClick={onClose}
      >
        <div
          className="settings-panel"
          onClick={(e) =>
            e.stopPropagation()
          }
        >

          <div className="settings-topbar">
            <button
              className="settings-icon-button"
              onClick={() =>
                setEditing(false)
              }
            >
              ←
            </button>

            <div className="settings-title">
              {t.editProfile}
            </div>

            <button
              className="settings-save-button"
              onClick={handleSave}
            >
              {t.save}
            </button>
          </div>

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

        </div>
      </div>
    );
  }

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
    >
      <div
        className="settings-panel"
        onClick={(e) =>
          e.stopPropagation()
        }
      >

        <div className="settings-topbar">
          <button
            className="settings-icon-button"
            onClick={onClose}
          >
            ←
          </button>

          <div className="settings-title">
            {t.settings}
          </div>

          <button
            className="settings-icon-button"
            onClick={() =>
              setEditing(true)
            }
          >
            ✎
          </button>
        </div>

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

          <div className="settings-row">
            <span>ⓘ</span>

            <div>
              <div className="settings-row-main">
                {bio || t.noBio}
              </div>

              <div className="settings-row-sub">
                {t.bio}
              </div>
            </div>
          </div>
        </div>

        <div className="settings-card">
          <button
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

      </div>
    </div>
  );

}