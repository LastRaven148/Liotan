import { useCallback, useEffect, useMemo, useState } from "react";
import { useLanguage } from "../../context/LanguageContext";
import {
  getDeviceSessionsApi,
  getTransportCapabilitiesApi,
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
  const [deleting, setDeleting] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [emailChangeOpen, setEmailChangeOpen] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [transportInfo, setTransportInfo] = useState(null);

  useEffect(() => setNameValue(displayName || ""), [displayName]);
  useEffect(() => setBioValue(bio || ""), [bio]);
  useEffect(() => () => previewAvatar && URL.revokeObjectURL(previewAvatar), [previewAvatar]);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const [sessionData, transportData] = await Promise.all([
          getDeviceSessionsApi(),
          getTransportCapabilitiesApi().catch(() => null)
        ]);
        if (!alive) return;
        setSessions(Array.isArray(sessionData?.sessions) ? sessionData.sessions : []);
        setTransportInfo(transportData || null);
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
      if (deleteOpen || logoutOpen || emailChangeOpen) return;
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
  }, [page, editing, deleteOpen, logoutOpen, emailChangeOpen, closeEdit]);

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
    setDeleteOpen(true);
  }

  async function confirmDelete() {
    if (deleting) return;
    if (deleteStep === 1) {
      setDeleteStep(2);
      return;
    }
    setDeleting(true);
    try {
      const ok = await deleteAccount?.();
      if (ok !== false) onClose?.();
    } finally {
      setDeleting(false);
    }
  }

  function closeDelete() {
    if (deleting) return;
    setDeleteOpen(false);
    setDeleteStep(1);
  }

  const commonState = {
    username,
    displayName,
    avatar,
    bio,
    language,
    sessions,
    transportInfo,
    menuOpen
  };
  const commonActions = {
    close: onClose,
    openEdit: () => setEditing(true),
    openPage: setPage,
    toggleMenu: () => setMenuOpen((value) => !value),
    askDelete,
    askLogout: () => { setMenuOpen(false); setLogoutOpen(true); }
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
          <PrivacyPage back={() => setPage("main")} labels={labels} actions={{ openEmailChange: () => setEmailChangeOpen(true) }} />
        ) : page === "general" ? (
          <GeneralPage back={() => setPage("main")} labels={labels} />
        ) : page === "sound" ? (
          <SoundPage back={() => setPage("main")} labels={labels} />
        ) : page === "devices" ? (
          <DevicesPage back={() => setPage("main")} labels={labels} state={{ sessions }} actions={{ revoke, logoutOthers }} />
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

        {emailChangeOpen && <EmailChangeModal labels={labels} onClose={() => setEmailChangeOpen(false)} />}

        {deleteOpen && <ConfirmModal
          title={labels.deleteAccount}
          text={deleteStep === 1 ? labels.deleteStepOne : labels.deleteStepTwo}
          cancel={labels.cancel}
          action={deleting ? "..." : deleteStep === 1 ? labels.continue : labels.accept}
          danger
          disabled={deleting}
          onClose={closeDelete}
          onAction={confirmDelete}
        />}
      </aside>
    </div>
  );
}

function ConfirmModal({ title, text, cancel, action, onClose, onAction, disabled }) {
  return (
    <div className="dialog-delete-modal-overlay settings-confirm-modal-overlay" onClick={onClose}>
      <div className="dialog-delete-modal" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-delete-modal-title">{title}</div>
        <div className="dialog-delete-modal-text">{text}</div>
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
    connectionPrivacyText: t.connectionPrivacyText || "Liotan автоматически выбирает безопасный маршрут соединения и при необходимости использует резервный транспорт для зашифрованного трафика.",
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
    emailChanged: t.emailChanged || "Почта изменена",
    invalidEmailOrCode: t.invalidEmailOrCode || "Проверьте почту или код"
  };
}

function EmailChangeModal({ labels, onClose }) {
  const [step, setStep] = useState("currentEmail");
  const [currentEmail, setCurrentEmail] = useState("");
  const [currentCode, setCurrentCode] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newCode, setNewCode] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(action) {
    if (busy) return;
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
          {step === "currentCode" && <button type="button" className="dialog-delete-modal-danger" disabled={busy} onClick={() => run(async () => { const data = await verifyEmailChangeCurrentApi(currentEmail, currentCode); setToken(data.token || ""); setStep("newEmail"); })}>{labels.confirm}</button>}
          {step === "newEmail" && <button type="button" className="dialog-delete-modal-danger" disabled={busy} onClick={() => run(async () => { await sendEmailChangeNewCodeApi(token, newEmail); setStep("newCode"); })}>{labels.sendCode}</button>}
          {step === "newCode" && <button type="button" className="dialog-delete-modal-danger" disabled={busy} onClick={() => run(async () => { await confirmEmailChangeApi(token, newEmail, newCode); setStep("done"); })}>{labels.confirm}</button>}
          {step === "done" && <button type="button" className="dialog-delete-modal-danger" onClick={onClose}>OK</button>}
        </div>
      </div>
    </div>
  );
}
