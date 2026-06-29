import {
  useEffect,
  useState
} from "react";

import { avatarUrl }
from "../../utils/avatarUrl";

import {
  useLanguage
} from "../../context/LanguageContext";

import {
  getDeviceSessionsApi,
  revokeSessionApi,
  logoutOtherSessionsApi,
  getTransportCapabilitiesApi
} from "../../services/api";

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
    deleteConfirmOpen,
    setDeleteConfirmOpen
  ] = useState(false);

  const [
    deleteStep,
    setDeleteStep
  ] = useState(1);

  const [
    logoutConfirmOpen,
    setLogoutConfirmOpen
  ] = useState(false);

  const [
    deleting,
    setDeleting
  ] = useState(false);

  const [
    sessions,
    setSessions
  ] = useState([]);

  const [
    sessionsLoading,
    setSessionsLoading
  ] = useState(false);

  const [
    transportInfo,
    setTransportInfo
  ] = useState(null);

  useEffect(() => {
    let alive = true;

    async function loadSecurityState() {
      setSessionsLoading(true);

      try {
        const [sessionData, transportData] =
          await Promise.all([
            getDeviceSessionsApi(),
            getTransportCapabilitiesApi().catch(() => null)
          ]);

        if (!alive) {
          return;
        }

        setSessions(
          Array.isArray(sessionData?.sessions)
            ? sessionData.sessions
            : []
        );

        setTransportInfo(
          transportData || null
        );
      } catch {
        if (alive) {
          setSessions([]);
        }
      } finally {
        if (alive) {
          setSessionsLoading(false);
        }
      }
    }

    loadSecurityState();

    return () => {
      alive = false;
    };
  }, []);

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

  function closeEdit() {
    if (previewAvatar) {
      URL.revokeObjectURL(previewAvatar);
    }

    setPreviewAvatar("");
    setPendingAvatarFile(null);
    setNameValue(displayName || "");
    setBioValue(bio || "");
    setEditing(false);
  }

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

      if (!saved) {
        return;
      }

      if (saved.displayName !== undefined) {
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

  async function handleRevokeSession(id) {
    await revokeSessionApi(id);

    setSessions(prev =>
      prev.filter(item => item.id !== id)
    );
  }

  async function handleLogoutOtherSessions() {
    await logoutOtherSessionsApi();

    setSessions(prev =>
      prev.filter(item => item.current)
    );
  }

  function formatSessionTime(value) {
    if (!value) {
      return "—";
    }

    try {
      return new Date(value).toLocaleString();
    } catch {
      return "—";
    }
  }

  function toggleLanguage() {
    setLanguage(
      language === "en"
        ? "ru"
        : "en"
    );
  }

  function openDeleteConfirm() {
    setDeleteStep(1);
    setDeleteConfirmOpen(true);
  }

  function closeDeleteConfirm() {
    if (deleting) {
      return;
    }

    setDeleteConfirmOpen(false);
    setDeleteStep(1);
  }

  async function handleDeleteAccount() {
    if (deleting) {
      return;
    }

    if (deleteStep === 1) {
      setDeleteStep(2);
      return;
    }

    setDeleting(true);

    try {
      const ok =
        await deleteAccount?.();

      if (ok !== false) {
        setDeleteConfirmOpen(false);
        setDeleteStep(1);
        onClose?.();
      }
    } finally {
      setDeleting(false);
    }
  }

  function closeLogoutConfirm() {
    setLogoutConfirmOpen(false);
  }

  function confirmLogout() {
    setLogoutConfirmOpen(false);
    logout?.();
  }

  useEffect(() => {
    const hasBlockingModal =
      logoutConfirmOpen ||
      deleteConfirmOpen;

    if (!hasBlockingModal) {
      return undefined;
    }

    document.body.classList.add(
      "liotan-delete-modal-open"
    );

    function handleEscape(e) {
      if (e.key !== "Escape") {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      window.__liotanModalEscHandledAt =
        Date.now();

      if (logoutConfirmOpen) {
        setLogoutConfirmOpen(false);
        return;
      }

      if (deleteConfirmOpen && !deleting) {
        setDeleteConfirmOpen(false);
        setDeleteStep(1);
      }
    }

    window.addEventListener(
      "keydown",
      handleEscape,
      true
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleEscape,
        true
      );

      document.body.classList.remove(
        "liotan-delete-modal-open"
      );
    };
  }, [
    logoutConfirmOpen,
    deleteConfirmOpen,
    deleting
  ]);

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
              onClick={closeEdit}
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
              className="settings-name-input"
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
            <div className="settings-name">
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

        <div className="settings-card settings-security-card">
          <div className="settings-section-title">
            Устройства
          </div>

          {sessionsLoading && (
            <div className="settings-muted-text">
              Загрузка...
            </div>
          )}

          {!sessionsLoading && sessions.length === 0 && (
            <div className="settings-muted-text">
              Активные устройства не найдены
            </div>
          )}

          {sessions.map(session => (
            <div
              key={session.id}
              className="settings-device-row"
            >
              <div className="settings-device-main">
                <div className="settings-device-name">
                  {session.deviceName || "Устройство"}
                  {session.current ? " • текущее" : ""}
                </div>

                <div className="settings-device-meta">
                  Последняя активность: {formatSessionTime(session.lastSeenAt)}
                </div>

                {session.deviceKeyFingerprint && (
                  <div className="settings-device-fingerprint">
                    Ключ: {session.deviceKeyFingerprint}
                  </div>
                )}
              </div>

              {!session.current && (
                <button
                  type="button"
                  className="settings-mini-danger"
                  onClick={() =>
                    handleRevokeSession(session.id)
                  }
                >
                  Отключить
                </button>
              )}
            </div>
          ))}

          {sessions.some(item => !item.current) && (
            <button
              type="button"
              className="settings-row button-row danger-row"
              onClick={handleLogoutOtherSessions}
            >
              <span>×</span>

              <div className="settings-row-main">
                Завершить все другие сеансы
              </div>
            </button>
          )}
        </div>

        <div className="settings-card settings-security-card">
          <div className="settings-section-title">
            Приватность соединения
          </div>

          <div className="settings-muted-text">
            Сейчас используется прямое защищённое соединение. Relay-режим подготовлен как запасной маршрут для зашифрованного трафика.
          </div>

          <div className="settings-device-meta">
            Relay: {transportInfo?.enabled ? "доступен" : "не включён"}
          </div>
        </div>

        <div className="settings-card">
          {logout && (
            <button
              type="button"
              className="settings-row button-row danger-row"
              onClick={() =>
                setLogoutConfirmOpen(true)
              }
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
              onClick={openDeleteConfirm}
            >
              <span>!</span>

              <div className="settings-row-main">
                Удалить аккаунт
              </div>
            </button>
          )}
        </div>

        {logoutConfirmOpen && (
          <div
            className="dialog-delete-modal-overlay settings-confirm-modal-overlay"
            onClick={closeLogoutConfirm}
          >
            <div
              className="dialog-delete-modal"
              onClick={(e) =>
                e.stopPropagation()
              }
            >
              <div className="dialog-delete-modal-title">
                Выйти из аккаунта
              </div>

              <div className="dialog-delete-modal-text">
                Подтверждаете свои действия?
              </div>

              <div className="dialog-delete-modal-actions">
                <button
                  type="button"
                  className="dialog-delete-modal-cancel"
                  onClick={closeLogoutConfirm}
                >
                  Отмена
                </button>

                <button
                  type="button"
                  className="dialog-delete-modal-danger"
                  onClick={confirmLogout}
                >
                  Продолжить
                </button>
              </div>
            </div>
          </div>
        )}

        {deleteConfirmOpen && (
          <div
            className="dialog-delete-modal-overlay settings-confirm-modal-overlay"
            onClick={closeDeleteConfirm}
          >
            <div
              className="dialog-delete-modal"
              onClick={(e) =>
                e.stopPropagation()
              }
            >
              <div className="dialog-delete-modal-title">
                Удалить аккаунт
              </div>

              <div className="dialog-delete-modal-text">
                {deleteStep === 1
                  ? "Все ваши данные будут удалены без возможности восстановления"
                  : "Вы точно уверены что хотите полностью удалить аккаунт?"}
              </div>

              <div className="dialog-delete-modal-actions">
                <button
                  type="button"
                  className="dialog-delete-modal-cancel"
                  onClick={closeDeleteConfirm}
                  disabled={deleting}
                >
                  Отмена
                </button>

                <button
                  type="button"
                  className="dialog-delete-modal-danger"
                  onClick={handleDeleteAccount}
                  disabled={deleting}
                >
                  {deleting
                    ? "..."
                    : deleteStep === 1
                      ? "Продолжить"
                      : "Принять"}
                </button>
              </div>
            </div>
          </div>
        )}
      </aside>
    </div>
  );

}
