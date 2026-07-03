import { SettingsSection } from "../components/SettingsPrimitives";

export default function DevicesPage({ back, state, actions, labels }) {
  const current = state.sessions.find((item) => item.current);
  const others = state.sessions.filter((item) => !item.current);
  return (
    <>
      <div className="drawer-topbar"><button className="drawer-icon-button" onClick={back}><span className="liotan-back-icon" aria-hidden="true" /></button><div className="drawer-title">{labels.devices}</div></div>
      <SettingsSection title={labels.thisDevice}>
        {current ? <DeviceRow session={current} labels={labels} /> : <div className="settings-muted-text">{labels.noDevices}</div>}
        {others.length > 0 && <button type="button" className="settings-terminate-button" onClick={actions.logoutOthers}>{labels.terminateOthers}</button>}
      </SettingsSection>
      <SettingsSection title={labels.activeSessions}>
        {others.length === 0 && <div className="settings-muted-text">{labels.noOtherDevices}</div>}
        {others.map((session) => <DeviceRow key={session.id} session={session} labels={labels} onRevoke={() => actions.revoke(session.id)} />)}
      </SettingsSection>
    </>
  );
}

function DeviceRow({ session, labels, onRevoke }) {
  return (
    <div className="settings-device-row">
      <div className="settings-device-main">
        <div className="settings-device-name">{formatDeviceName(session.deviceName, labels)}{session.current ? ` • ${labels.current}` : ""}</div>
        <div className="settings-device-meta">{labels.lastActive}: {formatSessionTime(session.lastSeenAt)}</div>
      </div>
      {onRevoke && <button type="button" className="settings-mini-danger" onClick={onRevoke}>{labels.disconnect}</button>}
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
