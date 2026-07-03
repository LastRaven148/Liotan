import { useEffect, useState } from "react";
import { SettingsCheck, SettingsSection } from "../components/SettingsPrimitives";

export default function SoundPage({ back, labels }) {
  const [devices, setDevices] = useState([]);
  const [callsEnabled, setCallsEnabled] = useState(localStorage.getItem("liotan_accept_calls") !== "0");
  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    navigator.mediaDevices.enumerateDevices().then(setDevices).catch(() => setDevices([]));
  }, []);
  const microphones = devices.filter((item) => item.kind === "audioinput");
  const speakers = devices.filter((item) => item.kind === "audiooutput");
  return (
    <>
      <div className="drawer-topbar"><button className="drawer-icon-button" onClick={back}><span className="liotan-back-icon" aria-hidden="true" /></button><div className="drawer-title">{labels.sound}</div></div>
      <SettingsSection title={labels.microphone}>
        <div className="settings-muted-text">{microphones[0]?.label || labels.defaultDevice}</div>
      </SettingsSection>
      <SettingsSection title={labels.speaker}>
        <div className="settings-muted-text">{speakers[0]?.label || labels.defaultDevice}</div>
      </SettingsSection>
      <SettingsSection>
        <SettingsCheck checked={callsEnabled} onChange={(v) => { setCallsEnabled(v); localStorage.setItem("liotan_accept_calls", v ? "1" : "0"); }} label={labels.acceptCalls} />
      </SettingsSection>
    </>
  );
}
