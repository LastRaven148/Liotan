import { useEffect, useState } from "react";

export default function SafetyNumberModal({ info, onClose, onVerify }) {
  const [qrUrl, setQrUrl] = useState("");
  const [scannedValue, setScannedValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    import("qrcode").then(module => module.default.toDataURL(info.qrPayload, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 220,
      color: { dark: "#07121d", light: "#ffffff" }
    })).then(value => { if (alive) setQrUrl(value); })
      .catch(() => { if (alive) setError("Не удалось построить QR-код"); });
    return () => { alive = false; };
  }, [info.qrPayload]);

  async function verify(method) {
    if (method === "scan" && scannedValue.trim() !== info.qrPayload) {
      setError("Отсканированный код не совпадает. Не подтверждайте этот чат.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onVerify();
      onClose();
    } catch (caught) {
      setError(caught?.message || "Safety number изменился до завершения проверки");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="safety-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="safety-modal" role="dialog" aria-modal="true" aria-labelledby="safety-title"
        onMouseDown={event => event.stopPropagation()}>
        <button type="button" className="safety-modal-close" onClick={onClose} aria-label="Закрыть">×</button>
        <h2 id="safety-title">Проверка защищённости</h2>
        <p className={`safety-status is-${info.verificationStatus}`}>{statusText(info.verificationStatus)}</p>
        <p>Сравните цифры или QR-код по независимому каналу — лично, по видеосвязи или при встрече.</p>
        {qrUrl && <img className="safety-qr" src={qrUrl} alt="QR-код safety number" />}
        <code className="safety-number">{info.formatted}</code>
        <div className="safety-participants">
          {info.participants.map(participant => <div key={participant.username}>
            <b>{participant.username}</b>
            <span>Root: {shortFingerprint(participant.rootFingerprint)}</span>
            <span>Версия устройств: {participant.directoryVersion}</span>
          </div>)}
        </div>
        <label className="safety-scan-field">
          <span>Результат внешнего QR-сканера</span>
          <input type="text" value={scannedValue} onChange={event => setScannedValue(event.target.value)}
            autoComplete="off" spellCheck="false" placeholder="liotan-safety:v2:…" />
        </label>
        {error && <div className="safety-error" role="alert">{error}</div>}
        <div className="safety-actions">
          <button type="button" disabled={busy || !scannedValue.trim()} onClick={() => verify("scan")}>Сравнить код</button>
          <button type="button" className="is-primary" disabled={busy} onClick={() => verify("manual")}>
            Я сравнил цифры
          </button>
        </div>
        <small>Первое получение ключа означает только first seen (TOFU), а не подтверждённую личность.</small>
      </section>
    </div>
  );
}

function statusText(status) {
  if (status === "verified") return "Проверено пользователем";
  if (status === "changed") return "Набор защищённых устройств изменился — нужна повторная проверка";
  if (status === "first-seen") return "Ключи получены впервые, но ещё не проверены";
  return "Не проверено";
}

function shortFingerprint(value) {
  return String(value || "").match(/.{1,4}/g)?.slice(0, 8).join(" ") || "—";
}
