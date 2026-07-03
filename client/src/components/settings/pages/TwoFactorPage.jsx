export default function TwoFactorPage({ back, labels, state, actions }) {
  const enabled = Boolean(state?.securityStatus?.totp?.enabled);
  const statusLabel = enabled ? labels.twoFactorEnabled : labels.twoFactorDisabled;
  const statusText = enabled ? labels.twoFactorEnabledText : labels.twoFactorSetupText;
  const actionLabel = enabled ? labels.disable || "Отключить" : labels.setup || "Подключить";

  const statusColor = enabled ? "#35d984" : "#ff8b8b";
  const statusBg = enabled ? "rgba(53,217,132,.14)" : "rgba(255,107,107,.14)";
  const statusBorder = enabled ? "rgba(53,217,132,.28)" : "rgba(255,107,107,.28)";
  const actionBg = enabled ? "rgba(255,107,107,.14)" : "rgba(53,217,132,.16)";
  const actionHoverBg = enabled ? "rgba(255,107,107,.2)" : "rgba(53,217,132,.22)";
  const actionColor = enabled ? "#ff8b8b" : "#35d984";
  const actionBorder = enabled ? "rgba(255,107,107,.28)" : "rgba(53,217,132,.3)";

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
            ...styles.statusPanel,
            background: statusBg,
            borderColor: statusBorder
          }}
        >
          <div style={styles.statusTopLine}>
            <span style={{ ...styles.statusDot, background: statusColor }} />
            <span style={{ ...styles.statusLabel, color: statusColor }}>
              {statusLabel}
            </span>
          </div>
          <div style={styles.statusText}>{statusText}</div>
        </div>
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
            borderColor: actionBorder
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
    margin: "0 16px 18px",
    padding: "18px",
    background: "#202b36",
    borderRadius: "16px",
    boxSizing: "border-box"
  },
  sectionTitle: {
    marginBottom: "12px",
    color: "#8da2b5",
    fontSize: "15px",
    lineHeight: "1.25",
    fontWeight: 800,
    letterSpacing: ".04em",
    textTransform: "uppercase"
  },
  statusPanel: {
    width: "100%",
    minHeight: "112px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    gap: "12px",
    padding: "17px 18px",
    border: "1px solid transparent",
    borderRadius: "15px",
    boxSizing: "border-box"
  },
  statusTopLine: {
    display: "flex",
    alignItems: "center",
    gap: "12px"
  },
  statusDot: {
    width: "12px",
    height: "12px",
    borderRadius: "50%",
    flexShrink: 0
  },
  statusLabel: {
    fontSize: "16px",
    lineHeight: "1.2",
    fontWeight: 850
  },
  statusText: {
    color: "#d5dee8",
    fontSize: "15px",
    lineHeight: "1.45",
    fontWeight: 550
  },
  manageTitle: {
    color: "#ffffff",
    fontSize: "16px",
    lineHeight: "1.25",
    fontWeight: 850,
    textAlign: "left"
  },
  manageHint: {
    marginTop: "8px",
    color: "#9fb0c1",
    fontSize: "14.5px",
    lineHeight: "1.4",
    fontWeight: 500,
    textAlign: "left"
  },
  actionButton: {
    width: "100%",
    minHeight: "52px",
    marginTop: "17px",
    border: "1px solid transparent",
    borderRadius: "14px",
    fontFamily: "inherit",
    fontSize: "16px",
    lineHeight: "1.2",
    fontWeight: 850,
    cursor: "pointer",
    transition: "background .15s ease, border-color .15s ease, color .15s ease"
  }
};
