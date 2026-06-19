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
  logout,
  deleteAccount,
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

  const [
    confirmDelete,
    setConfirmDelete
  ] = useState(false);

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

  async function handleDeleteAccount() {

    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    await deleteAccount?.();

  }

  if (editing) {
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
              onClick={() =>
                setEditing(false)
              }
            >
              ←
            </button>

            <div className="drawer-title">
              {t.editProfile || "Изменить профиль"}
            </div>

            <button
              type="button"
              className="drawer-save-button"
              onClick={handleSave}
            >
              {t.save || "Сохранить"}
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

            <input
              type="file"
              hidden
              accept="image/*"
              onChange={uploadAvatar}
            />
          </label>

          <div className="settings-card">
            <div className="settings-field-label">
              {t.username || "Имя пользователя"}
            </div>

            <div className="settings-readonly">
              {username}
            </div>

            <div className="settings-field-label">
              {t.bio || "О себе"}
            </div>

            <textarea
              className="settings-bio-input"
              value={value}
              onChange={(e) =>
                setValue(e.target.value)
              }
              placeholder={t.aboutYou || "О себе"}
              maxLength={100}
            />
          </div>
        </aside>
      </div>
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
            onClick={onClose}
          >
            ←
          </button>

          <div className="drawer-title">
            {t.settings || "Настройки"}
          </div>
        </div>

        <button
          type="button"
          className="settings-profile-button"
          onClick={() =>
            setEditing(true)
          }
        >
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

          <div>
            <div className="settings-name">
              {username}
            </div>

            <div className="settings-online">
              {t.online || "онлайн"}
            </div>
          </div>
        </button>

        <div className="settings-card">
          <button
            type="button"
            className="settings-row button-row"
            onClick={toggleLanguage}
          >
            <span>•</span>

            <div className="settings-row-main">
              {t.language || "Язык"}
            </div>

            <div className="settings-row-value">
              {language === "en"
                ? t.english || "English"
                : t.russian || "Русский"}
            </div>
          </button>

          <button
            type="button"
            className="settings-row button-row"
          >
            <span>•</span>
            <div className="settings-row-main">
              Фон чата
            </div>
          </button>

          <button
            type="button"
            className="settings-row button-row"
          >
            <span>•</span>
            <div className="settings-row-main">
              Цвет сообщений
            </div>
          </button>

          <button
            type="button"
            className="settings-row button-row"
          >
            <span>•</span>
            <div className="settings-row-main">
              Размер текста
            </div>
          </button>

          <button
            type="button"
            className="settings-row button-row"
          >
            <span>•</span>
            <div className="settings-row-main">
              Формат времени
            </div>
          </button>
        </div>

        <div className="settings-card">
          <button
            type="button"
            className="settings-row button-row"
          >
            <span>•</span>
            <div className="settings-row-main">
              Конфиденциальность
            </div>
          </button>

          <button
            type="button"
            className="settings-row button-row"
          >
            <span>•</span>
            <div className="settings-row-main">
              Устройства
            </div>
          </button>
        </div>

        <div className="settings-card">
          {logout && (
            <button
              type="button"
              className="settings-row button-row danger-row"
              onClick={logout}
            >
              <span>×</span>
              <div className="settings-row-main">
                {t.logout || "Выйти"}
              </div>
            </button>
          )}

          {deleteAccount && (
            <button
              type="button"
              className="settings-row button-row danger-row"
              onClick={handleDeleteAccount}
            >
              <span>×</span>
              <div className="settings-row-main">
                {confirmDelete
                  ? "Нажми ещё раз для удаления"
                  : "Удалить аккаунт"}
              </div>
            </button>
          )}
        </div>
      </aside>
    </div>
  );

}