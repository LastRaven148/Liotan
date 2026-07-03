const itemStyles = {
  row: {
    minHeight: 54,
    padding: "0 8px",
    gap: 15
  },
  icon: {
    width: 28,
    minWidth: 28
  },
  main: {
    fontSize: 14.5,
    lineHeight: 1.35,
    fontWeight: 600
  },
  sub: {
    fontSize: 13,
    lineHeight: 1.3
  },
  value: {
    fontSize: 13.5
  }
};

export function SettingsSection({ title, children, className = "" }) {
  return (
    <section className={`settings-card settings-page-section ${className}`.trim()}>
      {title && <div className="settings-section-title">{title}</div>}
      {children}
    </section>
  );
}

export function SettingsItem({ icon, title, subtitle, value, danger, onClick, children }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      className={`settings-row settings-item ${onClick ? "button-row" : ""} ${danger ? "danger-row" : ""}`.trim()}
      style={itemStyles.row}
      onClick={onClick}
    >
      {icon && <span className="settings-item-icon" style={itemStyles.icon}>{icon}</span>}
      <div className="settings-row-main" style={itemStyles.main}>
        <div>{title}</div>
        {subtitle && <div className="settings-row-sub" style={itemStyles.sub}>{subtitle}</div>}
      </div>
      {value !== undefined && value !== null && String(value) !== "" && (
        <div className="settings-row-value" style={itemStyles.value}>{value}</div>
      )}
      {children}
    </Tag>
  );
}

export function SettingsCheck({ checked, onChange, label, hint, disabled = false }) {
  return (
    <label className={`settings-check-row ${disabled ? "is-disabled" : ""}`.trim()}>
      <input
        type="checkbox"
        checked={Boolean(checked)}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
      />
      <span className="settings-check-box" />
      <span className="settings-check-text">
        <b>{label}</b>
        {hint && <small>{hint}</small>}
      </span>
    </label>
  );
}

export function SettingsSlider({ label, value, min, max, step = 1, onChange, suffix = "", disabled = false }) {
  return (
    <div className={`settings-slider-row ${disabled ? "is-disabled" : ""}`.trim()}>
      <div className="settings-slider-head">
        <span>{label}</span>
        <b>{value}{suffix}</b>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange?.(Number(e.target.value))}
      />
    </div>
  );
}

export function SettingsRadio({ active, title, subtitle, stacked, onClick }) {
  return (
    <button type="button" className={`settings-radio-row ${stacked ? "settings-radio-stacked" : ""}`.trim()} onClick={onClick}>
      <span className={active ? "settings-radio-dot active" : "settings-radio-dot"} />
      <span>
        <b>{title}</b>
        {subtitle && <small>{subtitle}</small>}
      </span>
    </button>
  );
}
