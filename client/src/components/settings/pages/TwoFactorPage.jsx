import { SettingsItem, SettingsSection } from "../components/SettingsPrimitives";

export default function TwoFactorPage({ back, labels, state, actions }) {
  const enabled = Boolean(state?.securityStatus?.totp?.enabled);

  return (
    <>
      <div className="drawer-topbar settings-topbar">
        <button type="button" className="drawer-icon-button" onClick={back}>←</button>
        <div className="drawer-title">{labels.twoFactorTitle}</div>
      </div>

      <SettingsSection title={labels.status || "Статус"}>
        <div className="settings-twofactor-status">
          <div className={enabled ? "settings-twofactor-badge enabled" : "settings-twofactor-badge"}>
            {enabled ? labels.twoFactorEnabled : labels.twoFactorDisabled}
          </div>
          <div className="settings-twofactor-text">
            {enabled ? labels.twoFactorEnabledText : labels.twoFactorSetupText}
          </div>
        </div>
      </SettingsSection>

      <SettingsSection>
        <SettingsItem
          title={enabled ? labels.twoFactorManage || labels.twoFactorTitle : labels.setup}
          subtitle={enabled ? labels.twoFactorDisableText : labels.twoFactorManualSetupHint}
          onClick={actions.openTotp}
        />
      </SettingsSection>
    </>
  );
}
