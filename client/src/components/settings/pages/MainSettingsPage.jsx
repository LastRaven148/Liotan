import { avatarUrl } from "../../../utils/avatarUrl";
import { SettingsItem, SettingsSection } from "../components/SettingsPrimitives";

export default function MainSettingsPage({ state, actions, labels }) {
  const { username, displayName, avatar, bio, language, sessions } = state;
  const shownName = displayName?.trim() || username;
  const currentLabel = language === "en" ? "English" : "Русский";
  const otherCount = sessions.filter((item) => !item.current).length;
  const totpEnabled = Boolean(state.securityStatus?.totp?.enabled);
  const browserConnectionRisk = getBrowserConnectionRisk();
  const connectionIsSuspicious = browserConnectionRisk !== "secure" || state.transportInfo?.connectionRisk === "suspicious";
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
        <div className="settings-info-row no-icon"><div><div className="settings-info-value">@{username}</div><div className="settings-info-label">{labels.username}</div></div></div>
        <div className="settings-info-row no-icon"><div><div className="settings-info-value">{bio || "—"}</div><div className="settings-info-label">{labels.bio}</div></div></div>
      </SettingsSection>

      <SettingsSection>
        <SettingsItem icon="" title={labels.notifications} onClick={() => actions.openPage("notifications")} />
        <SettingsItem icon="" title={labels.twoFactorAuth} value={totpEnabled ? labels.enabled : labels.disabled} onClick={actions.openTotp} />
        <SettingsItem icon="" title={labels.privacy} onClick={() => actions.openPage("privacy")} />
        <SettingsItem icon="" title={labels.general} onClick={() => actions.openPage("general")} />
        <SettingsItem icon="" title={labels.sound} onClick={() => actions.openPage("sound")} />
        <SettingsItem icon="" title={labels.devices} value={otherCount ? String(otherCount + 1) : ""} onClick={() => actions.openPage("devices")} />
        <SettingsItem icon={<TranslateIcon />} title={labels.language} value={currentLabel} onClick={() => actions.openPage("language")} />
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
    </>
  );
}


function TranslateIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path d="M4 5.5H13.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M8.75 3.5V5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M6 9.5C7.15 12.15 9.4 14.1 12.2 15.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M12.8 7.5C11.75 10.45 9.4 13.25 5 15.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M14.5 20.5L18 12.5L21.5 20.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M15.6 18H20.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
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
