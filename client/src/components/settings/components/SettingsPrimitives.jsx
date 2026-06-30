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
      onClick={onClick}
    >
      {icon && <span className="settings-item-icon">{icon}</span>}
      <div className="settings-row-main">
        <div>{title}</div>
        {subtitle && <div className="settings-row-sub">{subtitle}</div>}
      </div>
      {value && <div className="settings-row-value">{value}</div>}
      {children}
    </Tag>
  );
}

export function SettingsCheck({ checked, onChange, label, hint }) {
  return (
    <label className="settings-check-row">
      <input
        type="checkbox"
        checked={Boolean(checked)}
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

export function SettingsSlider({ label, value, min, max, step = 1, onChange, suffix = "" }) {
  return (
    <div className="settings-slider-row">
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
        onChange={(e) => onChange?.(Number(e.target.value))}
      />
    </div>
  );
}

export function SettingsRadio({ active, title, subtitle, onClick }) {
  return (
    <button type="button" className="settings-radio-row" onClick={onClick}>
      <span className={active ? "settings-radio-dot active" : "settings-radio-dot"} />
      <span>
        <b>{title}</b>
        {subtitle && <small>{subtitle}</small>}
      </span>
    </button>
  );
}
