import { useState } from "react";
import { SettingsRadio, SettingsSection, SettingsSlider } from "../components/SettingsPrimitives";

export default function GeneralPage({ back, labels }) {
  const [textSize, setTextSize] = useState(Number(localStorage.getItem("liotan_text_size") || 100));
  const [theme, setTheme] = useState(localStorage.getItem("liotan_theme") || "dark");
  const [timeFormat, setTimeFormat] = useState(localStorage.getItem("liotan_time_format") || "24");
  function saveTextSize(value) {
    setTextSize(value);
    localStorage.setItem("liotan_text_size", String(value));
    document.documentElement.style.setProperty("--liotan-message-scale", `${value / 100}`);
  }
  function saveTheme(value) {
    setTheme(value);
    localStorage.setItem("liotan_theme", value);
    document.documentElement.dataset.theme = value;
  }
  function saveTime(value) {
    setTimeFormat(value);
    localStorage.setItem("liotan_time_format", value);
  }
  return (
    <>
      <div className="drawer-topbar"><button className="drawer-icon-button" onClick={back}>←</button><div className="drawer-title">{labels.general}</div></div>
      <SettingsSection title={labels.textSize}>
        <SettingsSlider label={labels.messageTextSize} value={textSize} min={80} max={150} suffix="%" onChange={saveTextSize} />
      </SettingsSection>
      <SettingsSection title={labels.theme}>
        <SettingsRadio active={theme === "dark"} title={labels.dark} onClick={() => saveTheme("dark")} />
        <SettingsRadio active={theme === "light"} title={labels.light} onClick={() => saveTheme("light")} />
        <SettingsRadio active={theme === "system"} title={labels.system} onClick={() => saveTheme("system")} />
      </SettingsSection>
      <SettingsSection title={labels.wallpaper}>
        <SettingsRadio active title={labels.defaultWallpaper} subtitle={labels.wallpaperLater} />
      </SettingsSection>
      <SettingsSection title={labels.timeFormat}>
        <SettingsRadio active={timeFormat === "24"} title={labels.time24} onClick={() => saveTime("24")} />
        <SettingsRadio active={timeFormat === "12"} title={labels.time12} onClick={() => saveTime("12")} />
      </SettingsSection>
    </>
  );
}
