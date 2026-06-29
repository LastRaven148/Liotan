import { API } from "../config/api";

import {
  apiRequest
} from "../utils/apiRequest";

export function createCallId() {
  const bytes =
    crypto.getRandomValues(new Uint8Array(18));

  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export async function getCallRoute(username) {
  return apiRequest(
    `${API}/calls/route`,
    {
      method: "POST",
      body: JSON.stringify({ username })
    }
  );
}

export function supportsEncodedInsertableStreams() {
  return Boolean(
    window.RTCRtpSender?.prototype?.createEncodedStreams ||
    window.RTCRtpScriptTransform
  );
}

export function getSecurePeerConnectionConfig() {
  return {
    iceServers: [],
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
    iceCandidatePoolSize: 0
  };
}

export function createSecurePeerConnection() {
  return new RTCPeerConnection(
    getSecurePeerConnectionConfig()
  );
}

export function stopMediaStream(stream) {
  if (!stream) {
    return;
  }

  for (const track of stream.getTracks()) {
    track.stop();
  }
}

export function wipeUint8Array(value) {
  if (value instanceof Uint8Array) {
    crypto.getRandomValues(value);
    value.fill(0);
  }
}

export async function sha256Fingerprint(value) {
  const bytes =
    new TextEncoder().encode(String(value || ""));

  const digest =
    await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("")
    .match(/.{1,4}/g)
    ?.join(" ") || "";
}
