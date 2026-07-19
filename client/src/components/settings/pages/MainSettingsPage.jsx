import { avatarUrl } from "../../../utils/avatarUrl";
import LiotanIcon from "../../common/LiotanIcon";
import { SettingsItem, SettingsSection } from "../components/SettingsPrimitives";

export default function MainSettingsPage({ state, actions, labels }) {
  const { username, displayName, avatar, bio, language, sessions } = state;
  const shownName = displayName?.trim() || username;
  const currentLabel = language === "en" ? "English" : "Русский";
  const otherCount = sessions.filter((item) => !item.current).length;
  const totpEnabled = Boolean(state.securityStatus?.totp?.enabled);
  const browserConnectionRisk = getBrowserConnectionRisk();
  const connectionIsSuspicious = browserConnectionRisk !== "secure";
  return (
    <>
      <div className="drawer-topbar settings-topbar">
        <button type="button" className="drawer-icon-button" onClick={actions.close}><LiotanIcon name="back" size={22} /></button>
        <div className="drawer-title">{labels.settings}</div>
        <div className="settings-topbar-actions">
          <button type="button" className="drawer-icon-button" onClick={actions.openEdit} aria-label={labels.editProfile}><LiotanIcon name="edit" size={22} /></button>
          <button type="button" className="drawer-icon-button" onClick={actions.toggleMenu} aria-label={labels.more || "More"}><LiotanIcon name="moreVertical" size={22} /></button>
          {state.menuOpen && <div className="settings-overflow-menu" onMouseLeave={actions.closeMenu}>
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
        <div className="settings-info-row no-icon"><div><div className="settings-info-value">@{username}</div><div className="settings-info-label">{labels.username}</div></div></div>
        <div className="settings-info-row no-icon"><div><div className="settings-info-value">{bio || "—"}</div><div className="settings-info-label">{labels.bio}</div></div></div>
      </SettingsSection>

      <SettingsSection>
        <SettingsItem
    icon={<LiotanIcon name="bell" size={23} />}
    title={labels.notifications}
    onClick={() => actions.openPage("notifications")}
/>

<SettingsItem
    icon={<LiotanIcon name="shield2" size={23} />}
    title={labels.twoFactorAuth}
    onClick={() => actions.openPage("twofactor")}
/>

<SettingsItem
    icon={<LiotanIcon name="lock" size={23} />}
    title={labels.privacy}
    onClick={() => actions.openPage("privacy")}
/>

<SettingsItem
    icon={<LiotanIcon name="settings" size={23} />}
    title={labels.general}
    onClick={() => actions.openPage("general")}
/>

<SettingsItem
    icon={<LiotanIcon name="camera" size={23} />}
    title={labels.sound}
    onClick={() => actions.openPage("sound")}
/>

<SettingsItem
    icon={<LiotanIcon name="devices" size={23} />}
    title={labels.devices}
    value={otherCount ? String(otherCount + 1) : ""}
    onClick={() => actions.openPage("devices")}
/>

<SettingsItem
    icon={<LiotanIcon name="language" size={23} />}
    title={labels.language}
    value={currentLabel}
    onClick={() => actions.openPage("language")}
/>
      </SettingsSection>

      <SettingsSection title={labels.connectionPrivacy}>
        <div className="settings-muted-text">
          {connectionIsSuspicious ? labels.connectionUnsafeText : labels.connectionSecureText}
        </div>
        {connectionIsSuspicious && (
          <div className="settings-muted-text settings-connection-advice">
            {labels.connectionPrivacyAdvice}
          </div>
        )}
      </SettingsSection>

      <SettingsSection>
        <button
          type="button"
          className="settings-support-button"
          onClick={actions.openSupport}
        >
          {labels.support || "Поддержка"}
        </button>
      </SettingsSection>
    </>
  );
}


function getBrowserConnectionRisk() {
  if (typeof window === "undefined") return "secure";
  const host = window.location.hostname;
  const isLocalhost = host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "offline";
  if (window.location.protocol !== "https:" && !isLocalhost) return "insecure-context";
  if (window.isSecureContext === false && !isLocalhost) return "insecure-context";
  return "secure";
}
