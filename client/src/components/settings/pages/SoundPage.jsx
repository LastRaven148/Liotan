import { useEffect, useState } from "react";
import { SettingsSection } from "../components/SettingsPrimitives";

import LiotanIcon from "../../common/LiotanIcon";
export default function SoundPage({ back, labels }) {
  const [devices, setDevices] = useState([]);
  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    navigator.mediaDevices.enumerateDevices().then(setDevices).catch(() => setDevices([]));
  }, []);
  const microphones = devices.filter((item) => item.kind === "audioinput");
  const speakers = devices.filter((item) => item.kind === "audiooutput");
  const cameras = devices.filter((item) => item.kind === "videoinput");
  return (
    <>
      <div className="drawer-topbar"><button className="drawer-icon-button" onClick={back}><LiotanIcon name="back" size={22} /></button><div className="drawer-title">{labels.sound}</div></div>
      <SettingsSection title={labels.microphone}>
        <div className="settings-muted-text">{microphones[0]?.label || labels.defaultDevice}</div>
      </SettingsSection>
      <SettingsSection title={labels.speaker}>
        <div className="settings-muted-text">{speakers[0]?.label || labels.defaultDevice}</div>
      </SettingsSection>
      <SettingsSection title={labels.camera || "Камера"}>
        <div className="settings-muted-text">{cameras[0]?.label || labels.defaultDevice}</div>
      </SettingsSection>
      <SettingsSection title={labels.callsSection || "Звонки"}>
        <div className="settings-muted-text">
          {labels.callsUnavailable || "Звонки отключены до завершения аудита защищённого протокола. Ложный переключатель приёма звонков удалён."}
        </div>
      </SettingsSection>
    </>
  );
}
