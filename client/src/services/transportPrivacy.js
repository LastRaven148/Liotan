const TRANSPORT_MODE_KEY =
  "liotan_transport_mode";

export function getTransportMode() {
  const value =
    localStorage.getItem(
      TRANSPORT_MODE_KEY
    );

  return ["auto", "direct", "relay"].includes(value)
    ? value
    : "auto";
}

export function setTransportMode(mode) {
  const safeMode =
    ["auto", "direct", "relay"].includes(mode)
      ? mode
      : "auto";

  localStorage.setItem(
    TRANSPORT_MODE_KEY,
    safeMode
  );

  window.dispatchEvent(
    new CustomEvent(
      "liotan:transport-mode-changed",
      {
        detail: {
          mode: safeMode
        }
      }
    )
  );

  return safeMode;
}

export function shouldPreferRelay() {
  return getTransportMode() === "relay";
}

export function getTransportSecurityLabel() {
  const mode =
    getTransportMode();

  if (mode === "relay") {
    return "relay ciphertext-only";
  }

  if (mode === "direct") {
    return "direct tls";
  }

  return "auto";
}
