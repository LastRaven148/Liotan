import { SettingsItem, SettingsSection } from "../components/SettingsPrimitives";
import LiotanIcon from "../../common/LiotanIcon";

export default function PrivacyPage({ back, labels, actions }) {
  const items = [
    { title: labels.loginEmail, onClick: actions?.openEmailChange },
    { title: labels.blacklist, onClick: actions?.openBlocklist }
  ];

  return <>
    <div className="drawer-topbar">
      <button type="button" className="drawer-icon-button" onClick={back} aria-label={labels.back}><LiotanIcon name="back" size={22} /></button>
      <div className="drawer-title">{labels.privacy}</div>
    </div>
    <SettingsSection>
      {items.map(item => <SettingsItem key={item.title} icon="" title={item.title} value="" onClick={item.onClick} />)}
    </SettingsSection>
  </>;
}
