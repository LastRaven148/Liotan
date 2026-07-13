let audioContext = null;
let unlocked = false;

function getAudioContext() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  audioContext = audioContext || new AudioContext();
  return audioContext;
}

function getVolume() {
  const value = Number(localStorage.getItem("liotan_notify_volume") || 50);
  return Math.max(0, Math.min(100, value)) / 100;
}

export function notificationsEnabled() {
  return localStorage.getItem("liotan_notify_show") !== "0";
}

export function notificationSoundEnabled() {
  return localStorage.getItem("liotan_notify_sound") !== "0";
}

export function receivedSoundEnabled() {
  return notificationSoundEnabled() && localStorage.getItem("liotan_sound_received") !== "0";
}

export function sentSoundEnabled() {
  return notificationSoundEnabled() && localStorage.getItem("liotan_sound_sent") !== "0";
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
    // Creating or resuming AudioContext outside a user gesture produces noisy
    // browser warnings and is blocked by autoplay policy. Incoming events stay
    // silent until the first explicit click/key gesture unlocks audio.
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
  if (!receivedSoundEnabled()) return;
  playTone({ frequency: 740, duration: 0.18, gainValue: 0.12 });
}

export function playSentSound() {
  if (!sentSoundEnabled()) return;
  playTone({ frequency: 920, duration: 0.1, gainValue: 0.075 });
}
