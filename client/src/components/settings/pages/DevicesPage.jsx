import { SettingsItem, SettingsSection } from "../components/SettingsPrimitives";

export default function DevicesPage({ back, state, actions, labels }) {
  const current = state.sessions.find((item) => item.current);
  const others = state.sessions.filter((item) => !item.current);
  return (
    <>
      <div className="drawer-topbar"><button className="drawer-icon-button" onClick={back}>←</button><div className="drawer-title">{labels.devices}</div></div>
      <SettingsSection title={labels.thisDevice}>
        {current ? <DeviceRow session={current} labels={labels} /> : <div className="settings-muted-text">{labels.noDevices}</div>}
        {others.length > 0 && <SettingsItem icon="⊖" title={labels.terminateOthers} danger onClick={actions.logoutOthers} />}
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
        <div className="settings-device-name">{session.deviceName || labels.unknownDevice}{session.current ? ` • ${labels.current}` : ""}</div>
        <div className="settings-device-meta">{labels.lastActive}: {formatSessionTime(session.lastSeenAt)}</div>
      </div>
      {onRevoke && <button type="button" className="settings-mini-danger" onClick={onRevoke}>{labels.disconnect}</button>}
    </div>
  );
}

function formatSessionTime(value) {
  if (!value) return "—";
  try { return new Date(value).toLocaleString(); } catch { return "—"; }
}
