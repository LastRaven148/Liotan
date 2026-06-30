import { useRef, useState } from "react";
import { SettingsCheck, SettingsSection, SettingsSlider } from "../components/SettingsPrimitives";

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
  const previewTimerRef = useRef(null);
  const [settings, setSettings] = useState(() => ({
    show: localStorage.getItem("liotan_notify_show") !== "0",
    sound: localStorage.getItem("liotan_notify_sound") !== "0",
    sent: localStorage.getItem("liotan_sound_sent") !== "0",
    received: localStorage.getItem("liotan_sound_received") !== "0",
    privateChats: localStorage.getItem("liotan_notify_private") !== "0",
    groups: localStorage.getItem("liotan_notify_groups") !== "0",
    channels: localStorage.getItem("liotan_notify_channels") !== "0",
    volume: Number(localStorage.getItem("liotan_notify_volume") || 50)
  }));
  async function togglePermission() {
    if (typeof Notification === "undefined") {
      setPermission("unsupported");
      return;
    }
    if (permission !== "granted") {
      const result = await Notification.requestPermission();
      setPermission(result);
      return;
    }
    const next = !settings.show;
    setSettings((prev) => ({ ...prev, show: next }));
    localStorage.setItem("liotan_notify_show", next ? "1" : "0");
  }
  function update(key, value, storeKey) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    localStorage.setItem(storeKey, value ? "1" : "0");
  }
  function updateVolume(value) {
    setSettings((p) => ({...p, volume:value}));
    localStorage.setItem("liotan_notify_volume", String(value));
    window.clearTimeout(previewTimerRef.current);
    previewTimerRef.current = window.setTimeout(() => playVolumePreview(value), 35);
  }
  const notificationsActive = permission === "granted" && settings.show;
  return (
    <>
      <div className="drawer-topbar"><button className="drawer-icon-button" onClick={back}>←</button><div className="drawer-title">{labels.notifications}</div></div>
      <SettingsSection title="Web">
        <SettingsCheck checked={settings.show} onChange={(v) => update("show", v, "liotan_notify_show")} label={labels.showNotifications} />
        <button type="button" className="settings-primary-button" onClick={togglePermission}>{notificationsActive ? labels.disableNotifications : labels.enableNotifications}</button>
        <div className="settings-muted-text">{permission === "granted" ? labels.notificationsAllowed : labels.notificationsHelp}</div>
      </SettingsSection>
      <SettingsSection title={labels.soundBlock}>
        <SettingsCheck checked={settings.sound} onChange={(v) => update("sound", v, "liotan_notify_sound")} label={labels.notificationSound} />
        <SettingsSlider label={labels.volume} value={settings.volume} min={0} max={100} suffix="%" onChange={updateVolume} />
        <div className="settings-muted-text">{labels.volumeHelp}</div>
      </SettingsSection>
      <SettingsSection title={labels.soundEffects}>
        <SettingsCheck checked={settings.sent} onChange={(v) => update("sent", v, "liotan_sound_sent")} label={labels.sentSound} />
        <SettingsCheck checked={settings.received} onChange={(v) => update("received", v, "liotan_sound_received")} label={labels.receivedSound} />
      </SettingsSection>
      <SettingsSection title={labels.chatTypes}>
        <SettingsCheck checked={settings.privateChats} onChange={(v) => update("privateChats", v, "liotan_notify_private")} label={labels.privateChats} />
        <SettingsCheck checked={settings.groups} onChange={(v) => update("groups", v, "liotan_notify_groups")} label={labels.groups} />
        <SettingsCheck checked={settings.channels} onChange={(v) => update("channels", v, "liotan_notify_channels")} label={labels.channels} />
      </SettingsSection>
    </>
  );
}
