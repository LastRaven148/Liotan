import { useEffect, useState } from "react";
import { SettingsRadio, SettingsSection, SettingsSlider } from "../components/SettingsPrimitives";

import LiotanIcon from "../../common/LiotanIcon";
import {
  applyMessageScale,
  applyTheme,
  applyTimeFormat,
  applyWallpaper,
  normalizeMessageScale
} from "../../../utils/uiPreferences";
export default function GeneralPage({ back, labels }) {
  const [textSize, setTextSize] = useState(() => normalizeMessageScale(localStorage.getItem("liotan_text_size") || 100));
  const [theme, setTheme] = useState(localStorage.getItem("liotan_theme") || "dark");
  const [timeFormat, setTimeFormat] = useState(localStorage.getItem("liotan_time_format") || "24");
  const [wallpaper, setWallpaper] = useState(() => {
    const stored = localStorage.getItem("liotan_wallpaper_mode");
    return stored === "plain" || stored === "personal" ? "plain" : "pattern";
  });
  useEffect(() => {
    applyMessageScale(textSize);
  }, [textSize]);
  function saveTextSize(value) {
    const normalized = normalizeMessageScale(value);
    setTextSize(normalized);
    localStorage.setItem("liotan_text_size", String(normalized));
  }
  function saveTheme(value) {
    setTheme(applyTheme(value, { persist: true }));
  }
  function saveTime(value) {
    setTimeFormat(applyTimeFormat(value, { persist: true }));
  }
  function saveWallpaper(value) {
    setWallpaper(applyWallpaper(value, { persist: true }));
  }
  return (
    <>
      <div className="drawer-topbar"><button className="drawer-icon-button" onClick={back}><LiotanIcon name="back" size={22} /></button><div className="drawer-title">{labels.general}</div></div>
      <SettingsSection title={labels.textSize}>
        <SettingsSlider label={labels.messageTextSize} value={textSize} min={50} max={150} step={10} suffix="%" onChange={saveTextSize} />
      </SettingsSection>
      <SettingsSection title={labels.theme}>
        <SettingsRadio active={theme === "dark"} title={labels.dark} onClick={() => saveTheme("dark")} />
        <SettingsRadio active={theme === "light"} title={labels.light} onClick={() => saveTheme("light")} />
        <SettingsRadio active={theme === "system"} title={labels.system} onClick={() => saveTheme("system")} />
      </SettingsSection>
      <SettingsSection title={labels.wallpaper}>
        <SettingsRadio active={wallpaper === "pattern"} title={labels.defaultWallpaper} onClick={() => saveWallpaper("pattern")} />
        <SettingsRadio active={wallpaper === "plain"} title={labels.plainWallpaper || "Однотонный фон"} onClick={() => saveWallpaper("plain")} />
      </SettingsSection>
      <SettingsSection title={labels.timeFormat}>
        <SettingsRadio active={timeFormat === "24"} title={labels.time24} onClick={() => saveTime("24")} />
        <SettingsRadio active={timeFormat === "12"} title={labels.time12} onClick={() => saveTime("12")} />
      </SettingsSection>
    </>
  );
}
