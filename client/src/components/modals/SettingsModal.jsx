import { useCallback, useEffect, useMemo, useState } from "react";
import { useLanguage } from "../../context/LanguageContext";
import {
  getDeviceSessionsApi,
  logoutOtherSessionsApi,
  startEmailChangeCurrentApi,
  verifyEmailChangeCurrentApi,
  sendEmailChangeNewCodeApi,
  confirmEmailChangeApi,
  revokeSessionApi
} from "../../services/api";
import MainSettingsPage from "../settings/pages/MainSettingsPage";
import EditProfilePage from "../settings/pages/EditProfilePage";
import NotificationsPage from "../settings/pages/NotificationsPage";
import PrivacyPage from "../settings/pages/PrivacyPage";
import GeneralPage from "../settings/pages/GeneralPage";
import SoundPage from "../settings/pages/SoundPage";
import DevicesPage from "../settings/pages/DevicesPage";
import LanguagePage from "../settings/pages/LanguagePage";
import TwoFactorPage from "../settings/pages/TwoFactorPage";
import {
  getSecurityStatus,
  startTotpSetup,
  enableTotp,
  disableTotp
} from "../../security/securityApi.jsx";

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
  initialTotpOpen = false,
  onInitialTotpConsumed,
  onClose
}) {
  const { t, language, setLanguage } = useLanguage();
  const labels = useMemo(() => getLabels(t), [t]);
  const [page, setPage] = useState("main");
  const [editing, setEditing] = useState(false);
  const [nameValue, setNameValue] = useState(displayName || "");
  const [bioValue, setBioValue] = useState(bio || "");
  const [previewAvatar, setPreviewAvatar] = useState("");
  const [pendingAvatarFile, setPendingAvatarFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteStep, setDeleteStep] = useState(1);
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteCredential, setDeleteCredential] = useState("");
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [emailChangeOpen, setEmailChangeOpen] = useState(false);
  const [totpOpen, setTotpOpen] = useState(false);
  const [securityStatus, setSecurityStatus] = useState(null);
  const [restrictedSession, setRestrictedSession] = useState(null);
  const [sessions, setSessions] = useState([]);

  useEffect(() => setNameValue(displayName || ""), [displayName]);
  useEffect(() => setBioValue(bio || ""), [bio]);

  useEffect(() => {
    if (!initialTotpOpen) {
      return;
    }

    setTotpOpen(true);
    onInitialTotpConsumed?.();
  }, [initialTotpOpen, onInitialTotpConsumed]);
  useEffect(() => () => previewAvatar && URL.revokeObjectURL(previewAvatar), [previewAvatar]);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const [sessionData, securityData] = await Promise.all([
          getDeviceSessionsApi(),
          getSecurityStatus().catch(() => null)
        ]);
        if (!alive) return;
        setSessions(Array.isArray(sessionData?.sessions) ? sessionData.sessions : []);
        setSecurityStatus(securityData?.security || null);
        setRestrictedSession(securityData?.restrictedSession || null);
      } catch {
        if (alive) setSessions([]);
      }
    }
    load();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!deleteOpen && !logoutOpen) return undefined;
    document.body.classList.add("liotan-delete-modal-open");
    function handleEscape(e) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      window.__liotanModalEscHandledAt = Date.now();
      setLogoutOpen(false);
      if (!deleting) {
        setDeleteOpen(false);
        setDeleteStep(1);
      }
    }
    window.addEventListener("keydown", handleEscape, true);
    return () => {
      window.removeEventListener("keydown", handleEscape, true);
      document.body.classList.remove("liotan-delete-modal-open");
    };
  }, [deleteOpen, logoutOpen, deleting]);



  const closeEdit = useCallback(function closeEdit() {
    if (previewAvatar) URL.revokeObjectURL(previewAvatar);
    setPreviewAvatar("");
    setPendingAvatarFile(null);
    setNameValue(displayName || "");
    setBioValue(bio || "");
    setEditing(false);
  }, [previewAvatar, displayName, bio]);

  useEffect(() => {
    function handleSettingsEscape(e) {
      if (e.key !== "Escape") return;
      if (deleteOpen || logoutOpen || emailChangeOpen || totpOpen) return;
      if (editing) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation?.();
        window.__liotanModalEscHandledAt = Date.now();
        closeEdit();
        return;
      }
      if (page !== "main") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation?.();
        window.__liotanModalEscHandledAt = Date.now();
        setPage("main");
      }
    }
    window.addEventListener("keydown", handleSettingsEscape, true);
    return () => window.removeEventListener("keydown", handleSettingsEscape, true);
  }, [page, editing, deleteOpen, logoutOpen, emailChangeOpen, totpOpen, closeEdit]);

  function selectAvatar(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (previewAvatar) URL.revokeObjectURL(previewAvatar);
    setPendingAvatarFile(file);
    setPreviewAvatar(URL.createObjectURL(file));
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      const saved = await saveProfile?.({ bio: bioValue, displayName: nameValue });
      if (!saved) return;
      if (saved.displayName !== undefined) setDisplayName?.(saved.displayName || "");
      if (pendingAvatarFile) await uploadAvatar?.(pendingAvatarFile);
      if (previewAvatar) URL.revokeObjectURL(previewAvatar);
      setPreviewAvatar("");
      setPendingAvatarFile(null);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function revoke(id) {
    await revokeSessionApi(id);
    setSessions((prev) => prev.filter((item) => item.id !== id));
  }

  async function logoutOthers() {
    await logoutOtherSessionsApi();
    setSessions((prev) => prev.filter((item) => item.current));
  }

  function askDelete() {
    setMenuOpen(false);
    setDeleteStep(1);
    setDeleteError("");
    setDeleteCredential("");
    setDeleteOpen(true);
  }

  async function confirmDelete() {
    if (deleting) return;
    if (deleteStep === 1) {
      if (restrictedSession?.restricted) {
        setDeleteError(labels.restrictedSessionMessage);
        return;
      }
      setDeleteStep(2);
      return;
    }
    if (!deleteCredential.trim()) {
      setDeleteError(labels.reauthRequired);
      return;
    }
    setDeleting(true);
    try {
      const ok = await deleteAccount?.(securityStatus?.totpEnabled
        ? { totpCode: deleteCredential.trim() }
        : { currentPassword: deleteCredential });
      if (ok !== false) {
        onClose?.();
        return;
      }
      if (restrictedSession?.restricted) {
        setDeleteStep(1);
        setDeleteError(labels.restrictedSessionMessage);
      }
    } finally {
      setDeleting(false);
    }
  }

  function closeDelete() {
    if (deleting) return;
    setDeleteOpen(false);
    setDeleteStep(1);
    setDeleteError("");
    setDeleteCredential("");
  }

  async function refreshSecurityStatus() {
    const data = await getSecurityStatus().catch(() => null);
    setSecurityStatus(data?.security || null);
    setRestrictedSession(data?.restrictedSession || null);
    return data?.security || null;
  }

  const commonState = {
    username,
    displayName,
    avatar,
    bio,
    language,
    sessions,
    menuOpen,
    securityStatus
  };
  const commonActions = {
    close: onClose,
    openEdit: () => setEditing(true),
    openPage: setPage,
    toggleMenu: () => setMenuOpen((value) => !value),
    closeMenu: () => setMenuOpen(false),
    askDelete,
    askLogout: () => { setMenuOpen(false); setLogoutOpen(true); },
    openTotp: () => setTotpOpen(true),
    openSupport: () => {}
  };

  return (
    <div className="drawer-overlay drawer-overlay-left" onClick={onClose}>
      <aside className="settings-drawer" onClick={(e) => e.stopPropagation()}>
        {editing ? (
          <EditProfilePage
            labels={labels}
            state={{ username, avatar, previewAvatar, nameValue, bioValue, saving }}
            actions={{ closeEdit, save, selectAvatar, setName: setNameValue, setBio: setBioValue }}
          />
        ) : page === "notifications" ? (
          <NotificationsPage back={() => setPage("main")} labels={labels} />
        ) : page === "privacy" ? (
          <PrivacyPage
            back={() => setPage("main")}
            labels={labels}
            actions={{
              openEmailChange: () => setEmailChangeOpen(true),
              openTotp: () => setTotpOpen(true),
              totpEnabled: Boolean(securityStatus?.totp?.enabled)
            }}
          />
        ) : page === "twofactor" ? (
          <TwoFactorPage
            back={() => setPage("main")}
            labels={labels}
            state={{ securityStatus }}
            actions={{ openTotp: () => setTotpOpen(true) }}
          />
        ) : page === "general" ? (
          <GeneralPage back={() => setPage("main")} labels={labels} />
        ) : page === "sound" ? (
          <SoundPage back={() => setPage("main")} labels={labels} />
        ) : page === "devices" ? (
          <DevicesPage back={() => setPage("main")} labels={labels} state={{ sessions, username }} actions={{ revoke, logoutOthers }} />
        ) : page === "language" ? (
          <LanguagePage back={() => setPage("main")} labels={labels} language={language} setLanguage={setLanguage} />
        ) : (
          <MainSettingsPage labels={labels} state={commonState} actions={commonActions} />
        )}

        {logoutOpen && <ConfirmModal
          title={labels.logoutTitle}
          text={labels.logoutText}
          cancel={labels.cancel}
          action={labels.continue}
          onClose={() => setLogoutOpen(false)}
          onAction={() => { setLogoutOpen(false); logout?.(); }}
        />}

        {emailChangeOpen && <EmailChangeModal labels={labels} restrictedSession={restrictedSession} onClose={() => setEmailChangeOpen(false)} />}

        {totpOpen && <TotpModal
          labels={labels}
          securityStatus={securityStatus}
          restrictedSession={restrictedSession}
          refreshSecurityStatus={refreshSecurityStatus}
          onClose={() => setTotpOpen(false)}
        />}

        {deleteOpen && <ConfirmModal
          title={labels.deleteAccount}
          text={deleteStep === 1 ? labels.deleteStepOne : labels.deleteStepTwo}
          error={deleteError}
          cancel={labels.cancel}
          action={deleting ? "..." : deleteStep === 1 ? labels.continue : labels.accept}
          danger
          disabled={deleting}
          onClose={closeDelete}
          onAction={confirmDelete}
        >
          {deleteStep === 2 && <input
            className="settings-input"
            type={securityStatus?.totpEnabled ? "text" : "password"}
            inputMode={securityStatus?.totpEnabled ? "numeric" : undefined}
            autoComplete={securityStatus?.totpEnabled ? "one-time-code" : "current-password"}
            value={deleteCredential}
            onChange={(event) => setDeleteCredential(event.target.value)}
            placeholder={securityStatus?.totpEnabled ? labels.totpCode : labels.currentPassword}
          />}
        </ConfirmModal>}
      </aside>
    </div>
  );
}

function ConfirmModal({ title, text, error, cancel, action, onClose, onAction, disabled, children }) {
  return (
    <div className="dialog-delete-modal-overlay settings-confirm-modal-overlay" onClick={onClose}>
      <div className="dialog-delete-modal" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-delete-modal-title">{title}</div>
        <div className="dialog-delete-modal-text">{text}</div>
        {children}
        {error && <div className="settings-modal-error">{error}</div>}
        <div className="dialog-delete-modal-actions">
          <button type="button" className="dialog-delete-modal-cancel" onClick={onClose} disabled={disabled}>{cancel}</button>
          <button type="button" className="dialog-delete-modal-danger" onClick={onAction} disabled={disabled}>{action}</button>
        </div>
      </div>
    </div>
  );
}

function getLabels(t) {
  return {
    settings: t.settings || "Настройки",
    editProfile: t.editProfile || "Изменить профиль",
    save: t.save || "Сохранить",
    name: t.name || "Имя",
    username: t.username || "Имя пользователя",
    bio: t.bio || "О себе",
    online: t.online || "онлайн",
    logout: t.logout || "Выйти",
    logoutTitle: t.logoutTitle || "Выйти из аккаунта",
    logoutText: t.logoutText || "Подтверждаете свои действия?",
    deleteAccount: t.deleteAccount || "Удалить аккаунт",
    deleteStepOne: t.deleteStepOne || "Все ваши данные будут удалены без возможности восстановления",
    deleteStepTwo: t.deleteStepTwo || "Вы точно уверены что хотите полностью удалить аккаунт?",
    currentPassword: t.currentPassword || "Текущий пароль",
    totpCode: t.totpCode || "Код 2FA",
    reauthRequired: t.reauthRequired || "Повторно подтвердите вход",
    cancel: t.cancel || "Отмена",
    continue: t.continue || "Продолжить",
    accept: t.accept || "Принять",
    notifications: t.notifications || "Уведомления и звук",
    privacy: t.privacy || "Конфиденциальность",
    general: t.general || "Общие настройки",
    sound: t.sound || "Звук и камера",
    devices: t.devices || "Устройства",
    language: t.language || "Язык",
    connectionPrivacy: t.connectionPrivacy || "Приватность соединения",
    connectionPrivacyText: t.connectionPrivacyText || "Liotan автоматически выбирает безопасный маршрут соединения и при необходимости использует резервный API-маршрут.",
    connectionSecureText: t.connectionSecureText || "Ваше соединение защищено.",
    connectionUnsafeText: t.connectionUnsafeText || "Ваше соединение небезопасно.",
    connectionPrivacyAdvice: t.connectionPrivacyAdvice || "Если соединение выглядит небезопасным из-за VPN, прокси или сторонних сетевых сервисов, это предупреждение можно игнорировать.",
    available: t.available || "доступен",
    off: t.off || "не включён",
    showNotifications: t.showNotifications || "Показывать уведомления",
    enableNotifications: t.enableNotifications || "Включить уведомления",
    disableNotifications: t.disableNotifications || "Выключить уведомления",
    notificationsAllowed: t.notificationsAllowed || "Разрешено отправлять уведомления. Если уведомления не приходят — обновите страницу.",
    notificationsBlocked: t.notificationsBlocked || "Запрещено отправлять уведомления.",
    notificationsHelp: t.notificationsHelp || "Разрешите Liotan отправлять вам уведомления. Возможно, потребуется обновить страницу, чтобы увидеть изменения.",
    soundBlock: t.soundBlock || "Звук",
    notificationSound: t.notificationSound || "Звук уведомлений",
    volume: t.volume || "Громкость",
    volumeHelp: t.volumeHelp || "Перетяните и отпустите или нажмите, чтобы проверить громкость.",
    soundEffects: t.soundEffects || "Звуковые эффекты",
    sentSound: t.sentSound || "Звук отправки",
    receivedSound: t.receivedSound || "Звук получения",
    chatTypes: t.chatTypes || "Чаты",
    privateChats: t.privateChats || "Личные чаты",
    groups: t.groups || "Группы",
    channels: t.channels || "Каналы",
    blacklist: t.blacklist || "Чёрный список",
    loginEmail: t.loginEmail || "Почта для входа",
    twoFactorAuth: t.twoFactorAuth || "Двухфакторная аутентификация",
    enabled: t.enabled || "включено",
    disabled: t.disabled || "выключено",
    twoFactorTitle: t.twoFactorTitle || "Двухфакторная аутентификация",
    twoFactorSetupText: t.twoFactorSetupText || "2FA добавляет второй код при входе. Используйте Google Authenticator, Microsoft Authenticator, 2FAS или другое приложение для одноразовых кодов.",
    twoFactorEnabledText: t.twoFactorEnabledText || "Двухфакторная аутентификация защищает вход дополнительным одноразовым кодом.",
    twoFactorManualSetupHint: t.twoFactorManualSetupHint || "Открыть настройку Authenticator и backup-кодов.",
    twoFactorManage: t.twoFactorManage || "Управление 2FA",
    status: t.status || "Статус",
    twoFactorManualKey: t.twoFactorManualKey || "Ручной ключ",
    twoFactorInstructionTitle: t.twoFactorInstructionTitle || "Как подключить",
    twoFactorInstructionText: t.twoFactorInstructionText || "Откройте приложение Authenticator.\nНажмите добавить аккаунт.\nВыберите ручной ввод ключа.\nВведите название Liotan и ручной ключ ниже.\nВведите 6-значный код из приложения.",
    twoFactorBackupCodes: t.twoFactorBackupCodes || "Backup codes",
    twoFactorBackupCodesText: t.twoFactorBackupCodesText || "Сохраните эти backup-коды в безопасном месте. Каждый код одноразовый: он нужен для входа или отключения 2FA, если нет доступа к Authenticator.",
    twoFactorEnabled: t.twoFactorEnabled || "2FA включена",
    twoFactorDisabled: t.twoFactorDisabled || "2FA выключена",
    twoFactorDisableText: t.twoFactorDisableText || "Для отключения введите код Authenticator или backup code.",
    setup: t.setup || "Настроить",
    disable: t.disable || "Отключить",
    close: t.close || "Закрыть",
    backupCode: t.backupCode || "Backup code",
    support: t.support || "Поддержка",
    lastSeen: t.lastSeenPrivacy || "Кто видит последнее посещение",
    profilePhoto: t.profilePhoto || "Кто видит фото в моём профиле",
    about: t.about || "Кто видит мой раздел «О себе»",
    calls: t.calls || "Кто может звонить",
    invites: t.invites || "Кто может приглашать меня",
    forwardLinks: t.forwardLinks || "Кто может ссылаться на мой аккаунт при пересылке сообщений",
    everybody: t.everybody || "Все",
    nobody: t.nobody || "Никто",
    textSize: t.textSize || "Размер текста",
    messageTextSize: t.messageTextSize || "Текст сообщений",
    theme: t.theme || "Тема",
    dark: t.dark || "Тёмная",
    light: t.light || "Светлая",
    system: t.system || "По системе",
    wallpaper: t.wallpaper || "Обои для чатов",
    defaultWallpaper: t.defaultWallpaper || "Встроенные обои Liotan",
    wallpaperLater: t.wallpaperLater || "",
    personalWallpaper: t.personalWallpaper || "Личные обои для чатов",
    timeFormat: t.timeFormat || "Формат времени",
    time24: t.time24 || "24-часовой",
    time12: t.time12 || "12-часовой",
    microphone: t.microphone || "Микрофон",
    speaker: t.speaker || "Динамик",
    defaultDevice: t.defaultDevice || "По умолчанию",
    acceptCalls: t.acceptCalls || "Принимать звонки на этом устройстве",
    thisDevice: t.thisDevice || "Это устройство",
    activeSessions: t.activeSessions || "Активные сеансы",
    noDevices: t.noDevices || "Активные устройства не найдены",
    noOtherDevices: t.noOtherDevices || "Других активных сеансов нет",
    terminateOthers: t.terminateOthers || "Завершить все другие сеансы",
    unknownDevice: t.unknownDevice || "Устройство",
    current: t.current || "текущее",
    lastActive: t.lastActive || "Последняя активность",
    disconnect: t.disconnect || "Отключить",
    more: t.more || "Ещё",
    currentEmailTitle: t.currentEmailTitle || "Изменение почты",
    currentEmailText: t.currentEmailText || "Для того чтобы изменить почту, введите текущую.",
    newEmailTitle: t.newEmailTitle || "Новая почта",
    newEmailText: t.newEmailText || "Введите новую почту и подтвердите её кодом из письма.",
    email: t.email || "Почта",
    code: t.code || "Код",
    sendCode: t.sendCode || "Отправить код",
    confirm: t.confirm || "Подтвердить",
    emailChanged: t.emailChanged || "Смена почты поставлена в очередь",
    invalidEmailOrCode: t.invalidEmailOrCode || "Проверьте почту или код",
    restrictedSessionMessage: t.restrictedSessionMessage || "Доступ запрещен на 72 часа в целях безопасности."
  };
}

function TotpModal({ labels, securityStatus, restrictedSession, refreshSecurityStatus, onClose }) {
  const enabled = Boolean(securityStatus?.totp?.enabled);
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [backupCodes, setBackupCodes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (restrictedSession?.restricted) {
      setError(labels.restrictedSessionMessage);
    }
  }, [restrictedSession, labels.restrictedSessionMessage]);

  async function run(action) {
    if (busy) return;
    if (restrictedSession?.restricted) {
      setError(labels.restrictedSessionMessage);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (err) {
      setError(err?.message || "Security action failed");
    } finally {
      setBusy(false);
    }
  }

  async function beginSetup() {
    await run(async () => {
      const data = await startTotpSetup();
      setSetup(data);
      setCode("");
      setBackupCodes([]);
    });
  }

  async function confirmSetup() {
    await run(async () => {
      const data = await enableTotp(code);
      setBackupCodes(Array.isArray(data?.backupCodes) ? data.backupCodes : []);
      setSetup(null);
      setCode("");
      await refreshSecurityStatus?.();
    });
  }

  async function turnOff() {
    await run(async () => {
      await disableTotp({ code, backupCode });
      setCode("");
      setBackupCode("");
      await refreshSecurityStatus?.();
      onClose?.();
    });
  }

  const canConfirmSetup = /^\d{6}$/.test(String(code || ""));
  const canDisable = /^\d{6}$/.test(String(code || "")) || String(backupCode || "").trim().length >= 8;

  return (
    <div className="dialog-delete-modal-overlay settings-confirm-modal-overlay" onClick={onClose}>
      <div className="dialog-delete-modal settings-email-modal settings-totp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-delete-modal-title">{labels.twoFactorTitle}</div>

        {!enabled && !setup && !backupCodes.length && (
          <>
            <div className="dialog-delete-modal-text">
              {labels.twoFactorSetupText}
            </div>
            {error && <div className="settings-modal-error">{error}</div>}
            <div className="dialog-delete-modal-actions">
              <button type="button" className="dialog-delete-modal-cancel" onClick={onClose} disabled={busy}>{labels.cancel}</button>
              <button type="button" className="dialog-delete-modal-danger" onClick={beginSetup} disabled={busy}>{busy ? "..." : labels.setup}</button>
            </div>
          </>
        )}

        {!enabled && setup && !backupCodes.length && (
          <>
            <div className="dialog-delete-modal-text">{labels.twoFactorSetupText}</div>
            <div className="settings-security-card settings-security-instruction">
              <div className="settings-info-label">{labels.twoFactorInstructionTitle}:</div>
              <ol className="settings-totp-steps">
                {String(labels.twoFactorInstructionText || "").split("\n").filter(Boolean).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ol>
            </div>
            <div className="settings-security-card">
              <div className="settings-info-label">{labels.twoFactorManualKey}</div>
              <div className="settings-info-value settings-security-code">{setup.manualKey}</div>
            </div>
            <input className="settings-modal-input" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder={labels.code} inputMode="numeric" maxLength={6} />
            {error && <div className="settings-modal-error">{error}</div>}
            <div className="dialog-delete-modal-actions">
              <button type="button" className="dialog-delete-modal-cancel" onClick={onClose} disabled={busy}>{labels.cancel}</button>
              <button type="button" className="dialog-delete-modal-danger" onClick={confirmSetup} disabled={busy || !canConfirmSetup}>{busy ? "..." : labels.confirm}</button>
            </div>
          </>
        )}

        {backupCodes.length > 0 && (
          <>
            <div className="dialog-delete-modal-text">{labels.twoFactorBackupCodesText}</div>
            <div className="settings-security-card">
              {backupCodes.map((item) => <div key={item} className="settings-security-code">{item}</div>)}
            </div>
            <div className="dialog-delete-modal-actions">
              <button type="button" className="dialog-delete-modal-danger" onClick={onClose}>Я сохранил коды</button>
            </div>
          </>
        )}

        {enabled && (
          <>
            <div className="dialog-delete-modal-text">
              {labels.twoFactorEnabled}. {labels.twoFactorDisableText}
            </div>
            <input className="settings-modal-input" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder={labels.code} inputMode="numeric" maxLength={6} />
            <input className="settings-modal-input" value={backupCode} onChange={(e) => setBackupCode(e.target.value.toUpperCase())} placeholder={labels.backupCode} />
            {error && <div className="settings-modal-error">{error}</div>}
            <div className="dialog-delete-modal-actions">
              <button type="button" className="dialog-delete-modal-cancel" onClick={onClose} disabled={busy}>{labels.cancel}</button>
              <button type="button" className="dialog-delete-modal-danger" onClick={turnOff} disabled={busy || !canDisable}>{busy ? "..." : labels.disable}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function EmailChangeModal({ labels, restrictedSession, onClose }) {
  const [step, setStep] = useState("currentEmail");
  const [currentEmail, setCurrentEmail] = useState("");
  const [currentCode, setCurrentCode] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newCode, setNewCode] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (restrictedSession?.restricted) {
      setError(labels.restrictedSessionMessage);
    }
  }, [restrictedSession, labels.restrictedSessionMessage]);

  async function run(action) {
    if (busy) return;
    if (restrictedSession?.restricted) {
      setError(labels.restrictedSessionMessage);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (err) {
      setError(err?.message || labels.invalidEmailOrCode);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-delete-modal-overlay settings-confirm-modal-overlay" onClick={onClose}>
      <div className="dialog-delete-modal settings-email-modal" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-delete-modal-title">{step === "done" ? labels.emailChanged : step === "currentEmail" || step === "currentCode" ? labels.currentEmailTitle : labels.newEmailTitle}</div>
        {step === "currentEmail" && <>
          <div className="dialog-delete-modal-text">{labels.currentEmailText}</div>
          <input className="settings-modal-input" type="email" value={currentEmail} onChange={(e) => setCurrentEmail(e.target.value)} placeholder={labels.email} />
        </>}
        {step === "currentCode" && <>
          <div className="dialog-delete-modal-text">Введите одноразовый код из письма.</div>
          <input className="settings-modal-input" value={currentCode} onChange={(e) => setCurrentCode(e.target.value)} placeholder={labels.code} inputMode="numeric" />
        </>}
        {step === "newEmail" && <>
          <div className="dialog-delete-modal-text">{labels.newEmailText}</div>
          <input className="settings-modal-input" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder={labels.email} />
        </>}
        {step === "newCode" && <>
          <div className="dialog-delete-modal-text">Введите код, отправленный на новую почту.</div>
          <input className="settings-modal-input" value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder={labels.code} inputMode="numeric" />
        </>}
        {error && <div className="settings-modal-error">{error}</div>}
        <div className="dialog-delete-modal-actions">
          <button type="button" className="dialog-delete-modal-cancel" onClick={onClose} disabled={busy}>{labels.cancel}</button>
          {step === "currentEmail" && <button type="button" className="dialog-delete-modal-danger" disabled={busy} onClick={() => run(async () => { await startEmailChangeCurrentApi(currentEmail); setStep("currentCode"); })}>{labels.sendCode}</button>}
          {step === "currentCode" && <button type="button" className="dialog-delete-modal-danger" disabled={busy} onClick={() => run(async () => { const data = await verifyEmailChangeCurrentApi(currentEmail, currentCode); setToken(data.emailChangeToken || ""); setStep("newEmail"); })}>{labels.confirm}</button>}
          {step === "newEmail" && <button type="button" className="dialog-delete-modal-danger" disabled={busy} onClick={() => run(async () => { await sendEmailChangeNewCodeApi(token, newEmail); setStep("newCode"); })}>{labels.sendCode}</button>}
          {step === "newCode" && <button type="button" className="dialog-delete-modal-danger" disabled={busy} onClick={() => run(async () => { await confirmEmailChangeApi(token, newEmail, newCode, currentEmail); setStep("done"); })}>{labels.confirm}</button>}
          {step === "done" && <button type="button" className="dialog-delete-modal-danger" onClick={onClose}>OK</button>}
        </div>
      </div>
    </div>
  );
}
