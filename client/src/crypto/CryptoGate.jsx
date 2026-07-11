import { useEffect, useState } from "react";
import { cryptoBootstrap } from "./cryptoApi";
import { initializeMlsEngine } from "./mlsEngine";
import { createRecoveryKey, loadRecoveryKey, normalizeRecoveryKey, saveRecoveryKey } from "./recoveryStore";

export default function CryptoGate({ username, children }) {
  const [status, setStatus] = useState("loading");
  const [recoveryInput, setRecoveryInput] = useState("");
  const [newRecovery, setNewRecovery] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function start() {
      setStatus("loading");
      setError("");
      try {
        const stored = await loadRecoveryKey(username);
        if (stored) {
          await initializeMlsEngine({ username, recoveryKey: stored });
          if (!cancelled) setStatus("ready");
          return;
        }
        const bootstrap = await cryptoBootstrap();
        if (bootstrap.identity.rootPublicKey) {
          if (!cancelled) setStatus("recovery-required");
          return;
        }
        const created = createRecoveryKey();
        await saveRecoveryKey(username, created);
        await initializeMlsEngine({ username, recoveryKey: created });
        if (!cancelled) {
          setNewRecovery(created);
          setStatus("backup-required");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || "Не удалось открыть E2EE-хранилище");
          setStatus("error");
        }
      }
    }
    start();
    return () => { cancelled = true; };
  }, [username]);

  async function unlock() {
    setError("");
    setStatus("loading");
    try {
      const { encoded, bytes } = normalizeRecoveryKey(recoveryInput);
      bytes.fill(0);
      await initializeMlsEngine({ username, recoveryKey: encoded });
      await saveRecoveryKey(username, encoded);
      setRecoveryInput("");
      setStatus("ready");
    } catch (err) {
      setError(err?.message || "Неверный recovery key");
      setStatus("recovery-required");
    }
  }

  if (status === "ready") return children;

  return (
    <div className="crypto-gate" role="dialog" aria-modal="true" aria-labelledby="crypto-gate-title">
      <div className="crypto-gate-card">
        <div className="crypto-gate-badge">E2EE · MLS 1.0</div>
        <h1 id="crypto-gate-title">
          {status === "backup-required" ? "Сохраните recovery key" : "Защищённое хранилище"}
        </h1>

        {status === "loading" && <p>Открываем локальную MLS-базу…</p>}

        {status === "recovery-required" && <>
          <p>Это новое устройство. Введите 256-битный recovery key. Пароль входа не может расшифровать ваши ключи.</p>
          <input
            className="crypto-gate-input"
            type="password"
            autoComplete="off"
            spellCheck="false"
            value={recoveryInput}
            onChange={event => setRecoveryInput(event.target.value)}
            placeholder="Recovery key"
            aria-label="Recovery key"
          />
          <button type="button" className="crypto-gate-primary" onClick={unlock} disabled={!recoveryInput.trim()}>
            Разблокировать
          </button>
        </>}

        {status === "backup-required" && <>
          <p>Скопируйте ключ в менеджер паролей или офлайн-хранилище. Liotan и Cloudflare его не получают и восстановить не смогут.</p>
          <code className="crypto-gate-recovery">{newRecovery}</code>
          <button type="button" className="crypto-gate-secondary" onClick={() => navigator.clipboard?.writeText(newRecovery)}>
            Копировать
          </button>
          <label className="crypto-gate-confirm">
            <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
            <span>Я сохранил recovery key отдельно</span>
          </label>
          <button
            type="button"
            className="crypto-gate-primary"
            disabled={!confirmed}
            onClick={() => { setNewRecovery(""); setStatus("ready"); }}
          >
            Продолжить
          </button>
        </>}

        {status === "error" && <>
          <p>Crypto vault заблокирован. Сообщения не будут отправлены открытым текстом.</p>
          <button type="button" className="crypto-gate-primary" onClick={() => window.location.reload()}>
            Повторить
          </button>
        </>}

        {error && <div className="crypto-gate-error" role="alert">{error}</div>}
      </div>
    </div>
  );
}
