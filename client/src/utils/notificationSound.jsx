import { getNotificationSettingsApi } from "../services/api";

let audioContext = null;
let unlocked = false;

const DEFAULTS = Object.freeze({
  version: 0,
  desktopEnabled: true,
  soundEnabled: true,
  sentSoundEnabled: true,
  receivedSoundEnabled: true,
  privateChatsEnabled: true,
  groupsEnabled: true,
  volume: 50
});

function readCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem("liotan:notification-settings-cache:v1") || "null");
    return parsed && typeof parsed === "object" ? { ...DEFAULTS, ...parsed } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

let currentSettings = readCache();

function normalized(settings) {
  return {
    version: Math.max(0, Number(settings?.version) || 0),
    desktopEnabled: settings?.desktopEnabled !== false,
    soundEnabled: settings?.soundEnabled !== false,
    sentSoundEnabled: settings?.sentSoundEnabled !== false,
    receivedSoundEnabled: settings?.receivedSoundEnabled !== false,
    privateChatsEnabled: settings?.privateChatsEnabled !== false,
    groupsEnabled: settings?.groupsEnabled !== false,
    volume: Math.max(0, Math.min(100, Number(settings?.volume) || 0)),
    updatedAt: settings?.updatedAt || null
  };
}

export function applyNotificationSettings(settings) {
  currentSettings = normalized(settings);
  localStorage.setItem("liotan:notification-settings-cache:v1", JSON.stringify(currentSettings));
  window.dispatchEvent(new CustomEvent("liotan:notification-settings", { detail: currentSettings }));
  return { ...currentSettings };
}

export function getCachedNotificationSettings() {
  return { ...currentSettings };
}

export async function refreshNotificationSettings() {
  return applyNotificationSettings(await getNotificationSettingsApi({ fresh: true }));
}

function getAudioContext() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  audioContext = audioContext || new AudioContext();
  return audioContext;
}

function getVolume() {
  return currentSettings.volume / 100;
}

export function notificationsEnabled() {
  return currentSettings.desktopEnabled;
}

export function notificationsEnabledForChat(chatKey) {
  if (!notificationsEnabled()) return false;
  const value = String(chatKey || "");
  if (value.startsWith("group:")) return currentSettings.groupsEnabled;
  return currentSettings.privateChatsEnabled;
}

export function notificationSoundEnabled() {
  return currentSettings.soundEnabled;
}

export function receivedSoundEnabled() {
  return notificationSoundEnabled() && currentSettings.receivedSoundEnabled;
}

export function sentSoundEnabled() {
  return notificationSoundEnabled() && currentSettings.sentSoundEnabled;
}

export async function unlockNotificationSound() {
  if (unlocked) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") await ctx.resume();
    unlocked = ctx.state === "running";
  } catch {
    unlocked = false;
  }
}

export function playTone({ frequency = 740, duration = 0.18, gainValue = 0.12 } = {}) {
  try {
    const ctx = audioContext;
    if (!unlocked || !ctx || ctx.state !== "running") return;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const volume = getVolume();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, gainValue * volume), ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + duration + 0.02);
  } catch {}
}

export function playNotificationSound() {
  if (receivedSoundEnabled()) playTone({ frequency: 740, duration: 0.18, gainValue: 0.12 });
}

export function playSentSound() {
  if (sentSoundEnabled()) playTone({ frequency: 920, duration: 0.1, gainValue: 0.075 });
}
