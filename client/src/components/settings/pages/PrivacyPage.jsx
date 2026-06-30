import { SettingsItem, SettingsSection } from "../components/SettingsPrimitives";

export default function PrivacyPage({ back, labels }) {
  const items = [
    ["", labels.blacklist, ""],
    ["", labels.loginEmail, ""],
    ["", labels.lastSeenPrivacy || labels.lastSeen, labels.everybody],
    ["", labels.profilePhoto, labels.everybody],
    ["i", labels.about, labels.everybody],
    ["", labels.calls, labels.everybody],
    ["", labels.invites, labels.everybody],
    ["", labels.forwardLinks, labels.nobody]
  ];
  return (
    <>
      <div className="drawer-topbar"><button className="drawer-icon-button" onClick={back}>←</button><div className="drawer-title">{labels.privacy}</div></div>
      <SettingsSection>
        {items.map(([icon, title, value]) => <SettingsItem key={title} icon={icon} title={title} value={value} />)}
      </SettingsSection>
    </>
  );
}
