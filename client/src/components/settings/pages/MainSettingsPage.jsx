import { avatarUrl } from "../../../utils/avatarUrl";
import { SettingsItem, SettingsSection } from "../components/SettingsPrimitives";

export default function MainSettingsPage({ state, actions, labels }) {
  const { username, displayName, avatar, bio, language, sessions } = state;
  const shownName = displayName?.trim() || username;
  const currentLabel = language === "en" ? "English" : language === "uk" ? "Українська" : "Русский";
  const otherCount = sessions.filter((item) => !item.current).length;
  return (
    <>
      <div className="drawer-topbar settings-topbar">
        <button type="button" className="drawer-icon-button" onClick={actions.close}>←</button>
        <div className="drawer-title">{labels.settings}</div>
        <div className="settings-topbar-actions">
          <button type="button" className="drawer-icon-button" onClick={actions.openEdit} aria-label={labels.editProfile}>✎</button>
          <button type="button" className="drawer-icon-button" onClick={actions.toggleMenu} aria-label={labels.more || "More"}>⋮</button>
          {state.menuOpen && <div className="settings-overflow-menu">
            <button type="button" onClick={actions.askLogout}>{labels.logout}</button>
            <button type="button" className="danger" onClick={actions.askDelete}>{labels.deleteAccount}</button>
          </div>}
        </div>
      </div>

      <div className="settings-profile-hero">
        <button type="button" className="settings-avatar settings-avatar-hero" onClick={actions.openEdit}>
          {avatar ? <img src={avatarUrl(avatar)} alt="" className="avatar-image" /> : username.charAt(0).toUpperCase()}
        </button>
        <div className="settings-name settings-name-hero">{shownName}</div>
        <div className="settings-online">{labels.online}</div>
      </div>

      <SettingsSection>
        <div className="settings-info-row"><span className="settings-info-icon">@</span><div><div className="settings-info-value">@{username}</div><div className="settings-info-label">{labels.username}</div></div></div>
        <div className="settings-info-row"><span className="settings-info-icon">i</span><div><div className="settings-info-value">{bio || "—"}</div><div className="settings-info-label">{labels.bio}</div></div></div>
      </SettingsSection>

      <SettingsSection>
        <SettingsItem icon="" title={labels.notifications} onClick={() => actions.openPage("notifications")} />
        <SettingsItem icon="" title={labels.privacy} onClick={() => actions.openPage("privacy")} />
        <SettingsItem icon="" title={labels.general} onClick={() => actions.openPage("general")} />
        <SettingsItem icon="" title={labels.sound} onClick={() => actions.openPage("sound")} />
        <SettingsItem icon="" title={labels.devices} value={otherCount ? String(otherCount + 1) : ""} onClick={() => actions.openPage("devices")} />
        <SettingsItem icon="↔" title={labels.language} value={currentLabel} onClick={() => actions.openPage("language")} />
      </SettingsSection>

      <SettingsSection title={labels.connectionPrivacy}>
        <div className="settings-muted-text">{labels.connectionPrivacyText}</div>
        <div className="settings-muted-text settings-connection-advice">{labels.connectionPrivacyAdvice}</div>
      </SettingsSection>
    </>
  );
}
