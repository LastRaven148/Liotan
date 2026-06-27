let audioContext = null;
let unlocked = false;

export function unlockNotificationSound() {
  if (unlocked) {
    return;
  }

  try {
    audioContext =
      audioContext ||
      new AudioContext();

    if (audioContext.state === "suspended") {
      audioContext.resume();
    }

    unlocked = true;
  } catch {
    unlocked = false;
  }
}

export function playNotificationSound() {
  try {
    audioContext =
      audioContext ||
      new AudioContext();

    const oscillator =
      audioContext.createOscillator();

    const gain =
      audioContext.createGain();

    oscillator.type = "sine";
    oscillator.frequency.value = 740;

    gain.gain.setValueAtTime(
      0.0001,
      audioContext.currentTime
    );

    gain.gain.exponentialRampToValueAtTime(
      0.12,
      audioContext.currentTime + 0.01
    );

    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      audioContext.currentTime + 0.18
    );

    oscillator.connect(gain);
    gain.connect(audioContext.destination);

    oscillator.start();
    oscillator.stop(
      audioContext.currentTime + 0.2
    );
  } catch {
    // ignore
  }
}