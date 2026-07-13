import { useEffect, useState } from "react";
import { SettingsSection } from "../components/SettingsPrimitives";
import { getMlsEngine } from "../../../crypto/mlsEngine";

import LiotanIcon from "../../common/LiotanIcon";
export default function DevicesPage({ back, state, actions, labels }) {
  const [cryptoDevices, setCryptoDevices] = useState([]);
  const [currentCryptoDeviceId, setCurrentCryptoDeviceId] = useState("");
  const [cryptoError, setCryptoError] = useState("");
  const [sessionError, setSessionError] = useState("");
  const [sessionAction, setSessionAction] = useState("");
  useEffect(() => {
    let active = true;
    getMlsEngine().listCryptoDevices().then(result => {
      if (!active) return;
      setCryptoDevices(result.devices);
      setCurrentCryptoDeviceId(result.currentDeviceId);
    }).catch(error => { if (active) setCryptoError(error?.message || "MLS device list unavailable"); });
    return () => { active = false; };
  }, []);
  async function revokeCryptoDevice(deviceId) {
    try {
      await getMlsEngine().revokeCryptoDevice(deviceId);
      setCryptoDevices(previous => previous.map(device =>
        device.deviceId === deviceId ? { ...device, status: "revoked", revokedAt: new Date().toISOString() } : device
      ));
    } catch (error) {
      setCryptoError(error?.message || "Не удалось отозвать MLS-устройство");
    }
  }
  const current = state.sessions.find((item) => item.current);
  const others = state.sessions.filter((item) => !item.current);
  async function runSessionAction(name, action) {
    if (sessionAction) return;
    setSessionError("");
    setSessionAction(name);
    try {
      await action();
    } catch (error) {
      setSessionError(
        error?.status === 403
          ? labels.restrictedSessionMessage
          : error?.message || "Не удалось изменить активные сессии"
      );
    } finally {
      setSessionAction("");
    }
  }
  return (
    <>
      <div className="drawer-topbar"><button className="drawer-icon-button" onClick={back}><LiotanIcon name="back" size={22} /></button><div className="drawer-title">{labels.devices}</div></div>
      <SettingsSection title={labels.thisDevice}>
        {current ? <DeviceRow session={current} labels={labels} /> : <div className="settings-muted-text">{labels.noDevices}</div>}
        {others.length > 0 && <button type="button" className="settings-terminate-button" disabled={Boolean(sessionAction)} onClick={() => runSessionAction("others", actions.logoutOthers)}>{labels.terminateOthers}</button>}
        {sessionError && <div className="settings-action-error" role="alert">{sessionError}</div>}
      </SettingsSection>
      <SettingsSection title={labels.activeSessions}>
        {others.length === 0 && <div className="settings-muted-text">{labels.noOtherDevices}</div>}
        {others.map((session) => <DeviceRow key={session.id} session={session} labels={labels} disabled={Boolean(sessionAction)} onRevoke={() => runSessionAction(session.id, () => actions.revoke(session.id))} />)}
      </SettingsSection>
      <SettingsSection title="MLS E2EE devices">
        <div className="settings-muted-text">Отзыв устройства запускает обязательный Remove commit во всех чатах.</div>
        {cryptoDevices.map(device => (
          <div className="settings-device-row" key={device.deviceId}>
            <div className="settings-device-main">
              <div className="settings-device-name">
                {device.deviceId}{device.deviceId === currentCryptoDeviceId ? ` • ${labels.current}` : ""}
              </div>
              <div className="settings-device-meta">{device.status} · {formatSessionTime(device.lastSeenAt || device.verifiedAt)}</div>
            </div>
            {device.status === "active" && device.deviceId !== currentCryptoDeviceId && (
              <button type="button" className="settings-mini-danger" onClick={() => revokeCryptoDevice(device.deviceId)}>
                Отозвать MLS
              </button>
            )}
          </div>
        ))}
        {cryptoError && <div className="settings-muted-text">{cryptoError}</div>}
      </SettingsSection>
    </>
  );
}

function DeviceRow({ session, labels, onRevoke, disabled = false }) {
  return (
    <div className="settings-device-row">
      <div className="settings-device-main">
        <div className="settings-device-name">{formatDeviceName(session.deviceName, labels)}{session.current ? ` • ${labels.current}` : ""}</div>
        <div className="settings-device-meta">{labels.lastActive}: {formatSessionTime(session.lastSeenAt)}</div>
      </div>
      {onRevoke && <button type="button" className="settings-mini-danger" disabled={disabled} onClick={onRevoke}>{labels.disconnect}</button>}
    </div>
  );
}

function formatDeviceName(value, labels) {
  const name = String(value || "").trim();
  if (!name) return labels.unknownDevice;
  if (/^ios device$/i.test(name)) return "iPhone";
  if (/iphone\s*\/\s*ipad/i.test(name)) return "iPhone";
  if (/iphone/i.test(name)) return name.replace(/iphone\s*\/\s*ipad\s*ios/i, "iPhone").replace(/iphone\s*\/\s*ipad/i, "iPhone");
  if (/ipad/i.test(name) && !/iphone/i.test(name)) return name.replace(/ipad\s*os/i, "iPadOS");
  return name;
}

function formatSessionTime(value) {
  if (!value) return "—";
  try { return new Date(value).toLocaleString(); } catch { return "—"; }
}
