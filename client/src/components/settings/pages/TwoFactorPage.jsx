export default function TwoFactorPage({ back, labels, state, actions }) {
  const enabled = Boolean(state?.securityStatus?.totp?.enabled);
  const statusLabel = enabled ? labels.twoFactorEnabled : labels.twoFactorDisabled;
  const statusText = enabled ? labels.twoFactorEnabledText : labels.twoFactorSetupText;
  const actionLabel = enabled ? labels.disable || "Отключить" : labels.setup || "Подключить";

  const statusColor = enabled ? "#35c979" : "#ff8b8b";
  const statusBg = enabled ? "rgba(53,201,121,.14)" : "rgba(255,107,107,.14)";
  const actionBg = enabled ? "rgba(255,107,107,.14)" : "rgba(53,201,121,.16)";
  const actionHoverBg = enabled ? "rgba(255,107,107,.2)" : "rgba(53,201,121,.22)";
  const actionColor = enabled ? "#ff8b8b" : "#35d984";

  return (
    <>
      <div className="drawer-topbar settings-topbar">
        <button type="button" className="drawer-icon-button" onClick={back}>←</button>
        <div className="drawer-title">{labels.twoFactorTitle}</div>
      </div>

      <section style={styles.card}>
        <div style={styles.sectionTitle}>{labels.status || "Статус"}</div>
        <div
          style={{
            ...styles.statusBadge,
            color: statusColor,
            background: statusBg,
            borderColor: enabled ? "rgba(53,201,121,.28)" : "rgba(255,107,107,.28)"
          }}
        >
          <span style={{ ...styles.statusDot, background: statusColor }} />
          {statusLabel}
        </div>
        <div style={styles.statusText}>{statusText}</div>
      </section>

      <section style={styles.card}>
        <div style={styles.manageTitle}>{labels.twoFactorManage || "Управление 2FA"}</div>
        <div style={styles.manageHint}>
          {enabled ? labels.twoFactorDisableText : labels.twoFactorManualSetupHint}
        </div>
        <button
          type="button"
          onClick={actions.openTotp}
          style={{
            ...styles.actionButton,
            color: actionColor,
            background: actionBg,
            borderColor: enabled ? "rgba(255,107,107,.28)" : "rgba(53,201,121,.3)"
          }}
          onMouseEnter={(event) => {
            event.currentTarget.style.background = actionHoverBg;
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.background = actionBg;
          }}
        >
          {actionLabel}
        </button>
      </section>
    </>
  );
}

const styles = {
  card: {
    margin: "0 16px 16px",
    padding: "16px",
    background: "#202b36",
    borderRadius: "14px",
    boxSizing: "border-box"
  },
  sectionTitle: {
    marginBottom: "12px",
    color: "#8da2b5",
    fontSize: "13px",
    lineHeight: "1.25",
    fontWeight: 800,
    letterSpacing: ".04em",
    textTransform: "uppercase"
  },
  statusBadge: {
    width: "100%",
    minHeight: "38px",
    display: "flex",
    alignItems: "center",
    gap: "9px",
    padding: "0 12px",
    border: "1px solid transparent",
    borderRadius: "11px",
    boxSizing: "border-box",
    fontSize: "14px",
    lineHeight: "1.2",
    fontWeight: 800
  },
  statusDot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    flexShrink: 0
  },
  statusText: {
    marginTop: "12px",
    color: "#c3ced9",
    fontSize: "14px",
    lineHeight: "1.45",
    fontWeight: 500
  },
  manageTitle: {
    color: "#ffffff",
    fontSize: "15px",
    lineHeight: "1.25",
    fontWeight: 800,
    textAlign: "left"
  },
  manageHint: {
    marginTop: "7px",
    color: "#8da2b5",
    fontSize: "13px",
    lineHeight: "1.35",
    fontWeight: 500,
    textAlign: "left"
  },
  actionButton: {
    width: "100%",
    minHeight: "42px",
    marginTop: "14px",
    border: "1px solid transparent",
    borderRadius: "11px",
    fontFamily: "inherit",
    fontSize: "14px",
    lineHeight: "1.2",
    fontWeight: 800,
    cursor: "pointer",
    transition: "background .15s ease, border-color .15s ease, color .15s ease"
  }
};
