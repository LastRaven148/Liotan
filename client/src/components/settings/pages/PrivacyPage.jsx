import { SettingsItem, SettingsSection } from "../components/SettingsPrimitives";

import LiotanIcon from "../../common/LiotanIcon";
export default function PrivacyPage({ back, labels, actions }) {
  const items = [
    { icon: "", title: labels.loginEmail, value: "", onClick: actions?.openEmailChange }
  ];

  return (
    <>
      <div className="drawer-topbar"><button className="drawer-icon-button" onClick={back}><LiotanIcon name="back" size={22} /></button><div className="drawer-title">{labels.privacy}</div></div>
      <SettingsSection>
        {items.map((item) => <SettingsItem key={item.title} icon={item.icon} title={item.title} value={item.value} onClick={item.onClick} />)}
      </SettingsSection>
      <SettingsSection title={labels.privacyControlsTitle || "Дополнительные настройки"}>
        <div className="settings-muted-text">
          {labels.privacyControlsUnavailable || "Чёрный список и правила видимости не показываются как активные, пока сервер не умеет надёжно применять их ко всем сообщениям, профилям и звонкам."}
        </div>
      </SettingsSection>
    </>
  );
}
