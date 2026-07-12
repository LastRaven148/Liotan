import { useEffect, useRef, useState } from "react";
import { cryptoBootstrap } from "./cryptoApi";
import { initializeMlsEngine, reprovisionMlsDevice } from "./mlsEngine";
import { createRecoveryKey, loadRecoveryKey, normalizeRecoveryKey, saveRecoveryKey } from "./recoveryStore";

const DEFAULT_SERVICES = Object.freeze({
  cryptoBootstrap,
  initializeMlsEngine,
  reprovisionMlsDevice,
  createRecoveryKey,
  loadRecoveryKey,
  normalizeRecoveryKey,
  saveRecoveryKey
});

function friendlyError(error) {
  if (error?.code === "registered-storage-unavailable") {
    return "Локальное хранилище этого зарегистрированного устройства повреждено или недоступно. Сообщения не будут открыты без безопасного восстановления устройства.";
  }
  if (error?.code === "mls-storage-repair-failed") {
    return "Безопасное повторное создание локального хранилища не удалось. Проверьте, не открыта ли другая вкладка Liotan, и повторите попытку.";
  }
  if (error?.code === "mls-initialization-cancelled") return "Открытие защищённой сессии отменено.";
  return "Не удалось открыть защищённое MLS-хранилище. Открытый текст отправляться не будет.";
}

export default function CryptoGate({
  username,
  children,
  cryptoServices = DEFAULT_SERVICES,
  onStageChange,
  onReady,
  onBlocked
}) {
  const [status, setStatus] = useState("loading");
  const [attempt, setAttempt] = useState(0);
  const [recoveryInput, setRecoveryInput] = useState("");
  const [newRecovery, setNewRecovery] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [reprovisionConfirmed, setReprovisionConfirmed] = useState(false);
  const [failure, setFailure] = useState(null);
  const [error, setError] = useState("");
  const cardRef = useRef(null);

  useEffect(() => {
    if (status !== "ready") cardRef.current?.focus({ preventScroll: true });
  }, [status]);

  useEffect(() => {
    let cancelled = false;

    async function reveal(nextStatus) {
      if (cancelled) return;
      setStatus(nextStatus);
      await onBlocked?.();
    }

    async function finish() {
      if (cancelled) return;
      setStatus("ready");
      onStageChange?.("preparing-messages");
      await onReady?.();
    }

    async function start() {
      setStatus("loading");
      setFailure(null);
      setError("");
      onStageChange?.("opening-storage");
      try {
        const stored = await cryptoServices.loadRecoveryKey(username);
        if (stored) {
          await cryptoServices.initializeMlsEngine({ username, recoveryKey: stored });
          await finish();
          return;
        }

        const bootstrap = await cryptoServices.cryptoBootstrap();
        if (bootstrap.identity.rootPublicKey) {
          await reveal("recovery-required");
          return;
        }

        const created = cryptoServices.createRecoveryKey();
        await cryptoServices.saveRecoveryKey(username, created);
        await cryptoServices.initializeMlsEngine({ username, recoveryKey: created });
        if (!cancelled) {
          setNewRecovery(created);
          await reveal("backup-required");
        }
      } catch (caught) {
        if (!cancelled) {
          setFailure(caught);
          setError(friendlyError(caught));
          await reveal("error");
        }
      }
    }

    start();
    return () => { cancelled = true; };
  }, [attempt, cryptoServices, onBlocked, onReady, onStageChange, username]);

  async function unlock() {
    setError("");
    setStatus("loading");
    onStageChange?.("opening-storage");
    try {
      const { encoded, bytes } = cryptoServices.normalizeRecoveryKey(recoveryInput);
      bytes.fill(0);
      await cryptoServices.initializeMlsEngine({ username, recoveryKey: encoded });
      await cryptoServices.saveRecoveryKey(username, encoded);
      setRecoveryInput("");
      setStatus("ready");
      onStageChange?.("preparing-messages");
      await onReady?.();
    } catch (caught) {
      setError(caught?.message === "Recovery key does not match the pinned Liotan account root"
        ? "Recovery key не соответствует криптографической идентичности аккаунта."
        : friendlyError(caught));
      setStatus("recovery-required");
      await onBlocked?.();
    }
  }

  async function reprovision() {
    setError("");
    setStatus("loading");
    onStageChange?.("opening-storage");
    try {
      const { encoded, bytes } = cryptoServices.normalizeRecoveryKey(recoveryInput);
      bytes.fill(0);
      await cryptoServices.reprovisionMlsDevice({ username, recoveryKey: encoded });
      await cryptoServices.saveRecoveryKey(username, encoded);
      setRecoveryInput("");
      setStatus("ready");
      onStageChange?.("preparing-messages");
      await onReady?.();
    } catch (caught) {
      setError(caught?.message || "Безопасное восстановление устройства не удалось.");
      setStatus("reprovision");
      await onBlocked?.();
    }
  }

  if (status === "ready") return children;

  return (
    <div className="crypto-gate" role="dialog" aria-modal="true" aria-labelledby="crypto-gate-title">
      <section className="crypto-gate-card" ref={cardRef} tabIndex={-1}>
        <div className="crypto-gate-symbol" aria-hidden="true"><span /></div>
        <h1 id="crypto-gate-title">
          {status === "backup-required" && "Сохраните recovery key"}
          {status === "recovery-required" && "Восстановление защищённого устройства"}
          {status === "reprovision" && "Безопасно пересоздать устройство"}
          {status === "error" && "Защищённое хранилище недоступно"}
          {status === "loading" && "Открываем защищённое хранилище"}
        </h1>

        {status === "loading" && <p role="status" aria-live="polite">Проверяем локальное MLS-состояние. Сообщения пока недоступны.</p>}

        {status === "recovery-required" && <>
          <p>Это действительно новое устройство. Введите recovery key. Пароль входа и email-код не заменяют криптографический ключ.</p>
          <input className="crypto-gate-input" type="password" autoComplete="off" spellCheck="false"
            value={recoveryInput} onChange={event => setRecoveryInput(event.target.value)}
            placeholder="Recovery key" aria-label="Recovery key" />
          <button type="button" className="crypto-gate-primary" onClick={unlock} disabled={!recoveryInput.trim()}>
            Открыть защищённое устройство
          </button>
        </>}

        {status === "backup-required" && <>
          <p>Скопируйте ключ в менеджер паролей или офлайн-хранилище. Liotan, сервер и Cloudflare его не получают и восстановить не смогут.</p>
          <code className="crypto-gate-recovery">{newRecovery}</code>
          <button type="button" className="crypto-gate-secondary" onClick={() => navigator.clipboard?.writeText(newRecovery)}>Копировать</button>
          <label className="crypto-gate-confirm">
            <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
            <span>Я сохранил recovery key отдельно</span>
          </label>
          <button type="button" className="crypto-gate-primary" disabled={!confirmed}
            onClick={async () => { setNewRecovery(""); setStatus("ready"); onStageChange?.("preparing-messages"); await onReady?.(); }}>
            Продолжить
          </button>
        </>}

        {status === "error" && <>
          <p>{error}</p>
          <div className="crypto-gate-actions">
            <button type="button" className="crypto-gate-primary" onClick={() => setAttempt(value => value + 1)}>Повторить безопасно</button>
            {failure?.reprovisionRequired && <button type="button" className="crypto-gate-secondary" onClick={() => { setError(""); setStatus("reprovision"); }}>
              Восстановить это устройство
            </button>}
          </div>
          <small className="crypto-gate-diagnostic">Код диагностики: {failure?.code || "mls-storage-unavailable"}</small>
        </>}

        {status === "reprovision" && <>
          <p>Текущая запись устройства будет отозвана на сервере. Только после успешного отзыва будет удалена конкретная повреждённая MLS-база и создано новое устройство.</p>
          <input className="crypto-gate-input" type="password" autoComplete="off" spellCheck="false"
            value={recoveryInput} onChange={event => setRecoveryInput(event.target.value)}
            placeholder="Recovery key" aria-label="Recovery key для восстановления устройства" />
          <label className="crypto-gate-confirm">
            <input type="checkbox" checked={reprovisionConfirmed} onChange={event => setReprovisionConfirmed(event.target.checked)} />
            <span>Я понимаю, что локальное MLS-устройство будет пересоздано</span>
          </label>
          <button type="button" className="crypto-gate-primary" disabled={!recoveryInput.trim() || !reprovisionConfirmed} onClick={reprovision}>
            Отозвать и пересоздать устройство
          </button>
          <button type="button" className="crypto-gate-secondary" onClick={() => setStatus("error")}>Назад</button>
        </>}

        {error && status !== "error" && <div className="crypto-gate-error" role="alert">{error}</div>}
      </section>
    </div>
  );
}
