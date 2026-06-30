import { SettingsItem, SettingsSection } from "../components/SettingsPrimitives";

export default function PrivacyPage({ back, labels, actions }) {
  const items = [
    { icon: "", title: labels.blacklist, value: "0" },
    { icon: "", title: labels.loginEmail, value: "", onClick: actions?.openEmailChange },
    { icon: "", title: labels.lastSeenPrivacy || labels.lastSeen, value: labels.everybody },
    { icon: "", title: labels.profilePhoto, value: labels.everybody },
    { icon: "", title: labels.about, value: labels.everybody },
    { icon: "", title: labels.calls, value: labels.everybody },
    { icon: "", title: labels.invites, value: labels.everybody },
    { icon: "", title: labels.forwardLinks, value: labels.nobody }
  ];

  return (
    <>
      <div className="drawer-topbar"><button className="drawer-icon-button" onClick={back}>←</button><div className="drawer-title">{labels.privacy}</div></div>
      <SettingsSection>
        {items.map((item) => <SettingsItem key={item.title} icon={item.icon} title={item.title} value={item.value} onClick={item.onClick} />)}
      </SettingsSection>
    </>
  );
}
