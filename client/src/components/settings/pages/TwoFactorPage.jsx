import LiotanIcon from "../../common/LiotanIcon";
export default function TwoFactorPage({ back, labels, state, actions }) {
  const enabled = Boolean(state?.securityStatus?.totp?.enabled);
  const statusLabel = enabled ? labels.twoFactorEnabled : labels.twoFactorDisabled;
  const statusText = enabled ? labels.twoFactorEnabledText : labels.twoFactorSetupText;
  const actionLabel = enabled ? labels.disable || "Отключить" : labels.setup || "Подключить";

  return (
    <>
      <div className="drawer-topbar settings-topbar">
        <button type="button" className="drawer-icon-button" onClick={back}><LiotanIcon name="back" size={22} /></button>
        <div className="drawer-title">{labels.twoFactorTitle}</div>
      </div>

      <section className="twofactor-card">
        <div className="twofactor-section-title">{labels.status || "Статус"}</div>
        <div className={`twofactor-status ${enabled ? "is-enabled" : "is-disabled"}`}>
          <div className="twofactor-status-line">
            <span className="twofactor-status-dot" />
            <span className="twofactor-status-label">
              {statusLabel}
            </span>
          </div>
          <div className="twofactor-status-text">{statusText}</div>
        </div>
      </section>

      <section className="twofactor-card">
        <div className="twofactor-manage-title">{labels.twoFactorManage || "Управление 2FA"}</div>
        <div className="twofactor-manage-hint">
          {enabled ? labels.twoFactorDisableText : labels.twoFactorManualSetupHint}
        </div>
        <button
          type="button"
          onClick={actions.openTotp}
          className={`twofactor-action ${enabled ? "is-danger" : "is-safe"}`}
        >
          {actionLabel}
        </button>
      </section>
    </>
  );
}
