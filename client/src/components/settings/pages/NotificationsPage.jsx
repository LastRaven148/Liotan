import { useCallback, useEffect, useRef, useState } from "react";
import { updateNotificationSettingsApi } from "../../../services/api";
import {
  applyNotificationSettings,
  getCachedNotificationSettings,
  refreshNotificationSettings
} from "../../../utils/notificationSound";
import { SettingsCheck, SettingsSection, SettingsSlider } from "../components/SettingsPrimitives";
import LiotanIcon from "../../common/LiotanIcon";

function playVolumePreview(volume) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 720 + Number(volume || 0) * 3;
    gain.gain.value = Math.max(0.02, Math.min(1, Number(volume || 0) / 100)) * 0.08;
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.08);
    setTimeout(() => ctx.close?.(), 160);
  } catch {}
}

export default function NotificationsPage({ back, labels }) {
  const [permission, setPermission] = useState(typeof Notification !== "undefined" ? Notification.permission : "unsupported");
  const [settings, setSettings] = useState(getCachedNotificationSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const previewTimerRef = useRef(null);
  const volumeSaveTimerRef = useRef(null);
  const savingRef = useRef(false);
  const settingsRef = useRef(settings);
  const serverSettingsRef = useRef(settings);

  function applyLocal(value, { authoritative = false } = {}) {
    const applied = applyNotificationSettings(value);
    settingsRef.current = applied;
    if (authoritative) serverSettingsRef.current = applied;
    setSettings(applied);
    return applied;
  }

  const reload = useCallback(async () => {
    setError("");
    try {
      applyLocal(await refreshNotificationSettings(), { authoritative: true });
    } catch (err) {
      setError(err?.message || "Не удалось загрузить настройки уведомлений");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    function syncPermission() {
      setPermission(typeof Notification !== "undefined" ? Notification.permission : "unsupported");
    }
    function syncAccount(event) {
      if (event?.detail?.kind === "notification-settings-updated") reload();
    }
    window.addEventListener("focus", syncPermission);
    window.addEventListener("liotan:account-state-invalidated", syncAccount);
    return () => {
      window.removeEventListener("focus", syncPermission);
      window.removeEventListener("liotan:account-state-invalidated", syncAccount);
      window.clearTimeout(previewTimerRef.current);
      window.clearTimeout(volumeSaveTimerRef.current);
    };
  }, [reload]);

  async function persist(patch) {
    if (savingRef.current || loading) return;
    const previous = serverSettingsRef.current;
    const optimistic = { ...settingsRef.current, ...patch };
    savingRef.current = true;
    setSaving(true);
    setError("");
    applyLocal(optimistic);
    try {
      const saved = await updateNotificationSettingsApi(previous.version, patch);
      applyLocal(saved, { authoritative: true });
    } catch (err) {
      const rollback = err?.status === 409 && err?.data?.current ? err.data.current : previous;
      applyLocal(rollback, { authoritative: true });
      setError(err?.message || "Настройки не сохранены; изменения отменены");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function toggleDesktop() {
    if (typeof Notification === "undefined") {
      setPermission("unsupported");
      return;
    }
    if (!settings.desktopEnabled && Notification.permission === "default") {
      const result = await Notification.requestPermission().catch(() => Notification.permission || "default");
      setPermission(result);
      if (result !== "granted") return;
    }
    if (!settings.desktopEnabled && Notification.permission === "denied") {
      setPermission("denied");
      return;
    }
    await persist({ desktopEnabled: !settings.desktopEnabled });
  }

  function updateVolume(value) {
    applyLocal({ ...settingsRef.current, volume: value });
    window.clearTimeout(volumeSaveTimerRef.current);
    volumeSaveTimerRef.current = window.setTimeout(() => persist({ volume: value }), 220);
    window.clearTimeout(previewTimerRef.current);
    previewTimerRef.current = window.setTimeout(() => playVolumePreview(value), 35);
  }

  const permissionHelp = permission === "denied"
    ? "Браузер запретил уведомления. Разрешите их в настройках сайта."
    : permission === "unsupported"
      ? "Этот браузер не поддерживает web-уведомления."
      : "Настройки принадлежат аккаунту и синхронизируются между устройствами.";

  return <>
    <div className="drawer-topbar"><button type="button" className="drawer-icon-button" onClick={back} aria-label={labels.back}><LiotanIcon name="back" size={22} /></button><div className="drawer-title">{labels.notifications}</div></div>
    {loading && <div className="settings-muted-text" role="status">Загрузка…</div>}
    {error && <div className="settings-action-error" role="alert">{error}</div>}
    <fieldset className="settings-fieldset" disabled={loading || saving}>
      <SettingsSection title="Web" className="settings-notifications-web">
        <button type="button" className="settings-primary-button settings-primary-button-compact" onClick={toggleDesktop}>{settings.desktopEnabled ? labels.disableNotifications : labels.enableNotifications}</button>
        <div className="settings-muted-text">{permissionHelp}</div>
      </SettingsSection>
      <SettingsSection title={labels.soundBlock}>
        <SettingsCheck checked={settings.soundEnabled} onChange={value => persist({ soundEnabled: value })} label={labels.notificationSound} />
        <SettingsSlider label={labels.volume} value={settings.volume} min={0} max={100} suffix="%" disabled={!settings.soundEnabled} onChange={updateVolume} />
        <div className="settings-muted-text">{labels.volumeHelp}</div>
      </SettingsSection>
      <SettingsSection title={labels.soundEffects}>
        <SettingsCheck checked={settings.sentSoundEnabled} disabled={!settings.soundEnabled} onChange={value => persist({ sentSoundEnabled: value })} label={labels.sentSound} />
        <SettingsCheck checked={settings.receivedSoundEnabled} disabled={!settings.soundEnabled} onChange={value => persist({ receivedSoundEnabled: value })} label={labels.receivedSound} />
      </SettingsSection>
      <SettingsSection title={labels.chatTypes}>
        <SettingsCheck checked={settings.privateChatsEnabled} onChange={value => persist({ privateChatsEnabled: value })} label={labels.privateChats} />
        <SettingsCheck checked={settings.groupsEnabled} onChange={value => persist({ groupsEnabled: value })} label={labels.groups} />
      </SettingsSection>
    </fieldset>
  </>;
}
