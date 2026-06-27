import {
  useEffect,
  useState
} from "react";

import { avatarUrl }
from "../../utils/avatarUrl";

import {
  useLanguage
} from "../../context/LanguageContext";

export default function SettingsModal({
  username,
  displayName,
  setDisplayName,
  avatar,
  bio,
  saveProfile,
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
    nameValue,
    setNameValue
  ] = useState(displayName || "");

  const [
    bioValue,
    setBioValue
  ] = useState(bio || "");

  const [
    previewAvatar,
    setPreviewAvatar
  ] = useState("");

  const [
    pendingAvatarFile,
    setPendingAvatarFile
  ] = useState(null);

  const [
    saving,
    setSaving
  ] = useState(false);

  const [
    confirmDelete,
    setConfirmDelete
  ] = useState(false);

  useEffect(() => {
    setNameValue(displayName || "");
  }, [
    displayName
  ]);

  useEffect(() => {
    setBioValue(bio || "");
  }, [
    bio
  ]);

  useEffect(() => {
    return () => {
      if (previewAvatar) {
        URL.revokeObjectURL(previewAvatar);
      }
    };
  }, [
    previewAvatar
  ]);

  const shownName =
    displayName?.trim() ||
    username;

  const shownAvatar =
    previewAvatar ||
    avatarUrl(avatar);

  function handleAvatarSelect(e) {
    const file =
      e.target.files?.[0];

    e.target.value = "";

    if (!file) {
      return;
    }

    if (previewAvatar) {
      URL.revokeObjectURL(previewAvatar);
    }

    setPendingAvatarFile(file);

    setPreviewAvatar(
      URL.createObjectURL(file)
    );
  }

  async function handleSave() {

    if (saving) {
      return;
    }

    setSaving(true);

    try {
      const saved =
        await saveProfile?.({
          bio: bioValue,
          displayName: nameValue
        });

      if (saved?.displayName !== undefined) {
        setDisplayName?.(
          saved.displayName || ""
        );
      }

      if (pendingAvatarFile) {
        await uploadAvatar?.(
          pendingAvatarFile
        );
      }

      if (previewAvatar) {
        URL.revokeObjectURL(previewAvatar);
      }

      setPreviewAvatar("");
      setPendingAvatarFile(null);
      setEditing(false);
    } finally {
      setSaving(false);
    }

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
              disabled={saving}
            >
              {saving
                ? "..."
                : t.save || "Сохранить"}
            </button>
          </div>

          <label className="edit-avatar">
            <div className="settings-avatar large">
              {shownAvatar ? (
                <img
                  src={shownAvatar}
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
              onChange={handleAvatarSelect}
            />
          </label>

          <div className="settings-card">
            <div className="settings-field-label">
              Имя
            </div>

            <input
              className="settings-bio-input"
              value={nameValue}
              onChange={(e) =>
                setNameValue(e.target.value)
              }
              placeholder="Имя"
              maxLength={20}
            />

            <div className="settings-field-label">
              {t.username || "Имя пользователя"}
            </div>

            <div className="settings-readonly">
              @{username}
            </div>

            <div className="settings-field-label">
              {t.bio || "О себе"}
            </div>

            <textarea
              className="settings-bio-input"
              value={bioValue}
              onChange={(e) =>
                setBioValue(e.target.value)
              }
              placeholder={t.aboutYou || "О себе"}
              maxLength={50}
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
            <div className="settings-name-input">
              {shownName}
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