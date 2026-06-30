import { SettingsRadio, SettingsSection } from "../components/SettingsPrimitives";

export default function LanguagePage({ back, language, setLanguage, labels }) {
  function choose(value) {
    setLanguage(value);
  }
  return (
    <>
      <div className="drawer-topbar"><button className="drawer-icon-button" onClick={back}>←</button><div className="drawer-title">{labels.language}</div></div>
      <SettingsSection>
        <SettingsRadio active={language === "ru"} title="Russian" subtitle="Русский" stacked onClick={() => choose("ru")} />
        <SettingsRadio active={language === "en"} title="English" subtitle="English" stacked onClick={() => choose("en")} />
        <SettingsRadio active={language === "uk"} title="Ukrainian" subtitle="Українська" stacked onClick={() => choose("uk")} />
      </SettingsSection>
    </>
  );
}
