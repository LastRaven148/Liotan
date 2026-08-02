import { useEffect, useRef, useState } from "react";
import { cryptoBootstrap } from "./cryptoApi";
import {
  confirmPendingRecoveryDevice,
  initializeMlsEngine,
  reprovisionMlsDevice
} from "./mlsEngine";
import { createRecoveryKey, loadRecoveryKey, normalizeRecoveryKey, saveRecoveryKey } from "./recoveryStore";

const DEFAULT_SERVICES = Object.freeze({
  cryptoBootstrap,
  confirmPendingRecoveryDevice,
  initializeMlsEngine,
  reprovisionMlsDevice,
  createRecoveryKey,
  loadRecoveryKey,
  normalizeRecoveryKey,
  saveRecoveryKey
});

function friendlyError(error) {
  if (error?.code === "mls-runtime-unavailable") {
    return "Браузер не смог запустить криптографический модуль CoreCrypto. Обновите браузер и повторите попытку; сообщения останутся заблокированы.";
  }
  if (error?.code === "mls-startup-failed") {
    return "Не удалось завершить подготовку защищённой сессии. Проверьте соединение и повторите попытку; локальное хранилище не удалялось.";
  }
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
  const [localPassphrase, setLocalPassphrase] = useState("");
  const [localProtectionRequired, setLocalProtectionRequired] = useState(false);
  const [newRecovery, setNewRecovery] = useState("");
  const [clipboardNotice, setClipboardNotice] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [reprovisionConfirmed, setReprovisionConfirmed] = useState(false);
  const [recoveryBootstrapConfirmed, setRecoveryBootstrapConfirmed] = useState(false);
  const [recoveryEnrollmentConfirmed, setRecoveryEnrollmentConfirmed] = useState(false);
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
          if (caught?.code === "recovery-user-presence-required") {
            setLocalProtectionRequired(true);
            setError("");
            await reveal("local-passphrase");
          } else if (caught?.code === "mls-device-approval-required") {
            setError("");
            await reveal("approval-pending");
          } else if (caught?.code === "mls-recovery-bootstrap-required") {
            setError("");
            await reveal("recovery-bootstrap");
          } else {
            setError(friendlyError(caught));
            await reveal("error");
          }
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
      if (caught?.code === "mls-device-approval-required" ||
        caught?.code === "mls-recovery-bootstrap-required") {
        setFailure(caught);
        setStatus(caught.code === "mls-device-approval-required"
          ? "approval-pending"
          : "recovery-bootstrap");
        await onBlocked?.();
        return;
      }
      setError(caught?.message === "Recovery key does not match the pinned Liotan account root"
        ? "Recovery key не соответствует криптографической идентичности аккаунта."
        : friendlyError(caught));
      setStatus("recovery-required");
      await onBlocked?.();
    }
  }

  async function unlockLocalRecovery() {
    setError("");
    setStatus("loading");
    onStageChange?.("opening-storage");
    try {
      const stored = await cryptoServices.loadRecoveryKey(username, { passphrase: localPassphrase });
      setLocalPassphrase("");
      await cryptoServices.initializeMlsEngine({ username, recoveryKey: stored });
      setStatus("ready");
      onStageChange?.("preparing-messages");
      await onReady?.();
    } catch (caught) {
      setLocalPassphrase("");
      if (caught?.code === "mls-device-approval-required" ||
        caught?.code === "mls-recovery-bootstrap-required") {
        setFailure(caught);
        setStatus(caught.code === "mls-device-approval-required"
          ? "approval-pending"
          : "recovery-bootstrap");
      } else {
        setError(caught?.message || "Не удалось открыть локальное recovery-хранилище");
        setStatus("local-passphrase");
      }
      await onBlocked?.();
    }
  }

  async function confirmRecoveryBootstrap({ allowActiveDevices = false } = {}) {
    if (allowActiveDevices ? !recoveryEnrollmentConfirmed : !recoveryBootstrapConfirmed) return;
    setError("");
    setStatus("loading");
    onStageChange?.("opening-storage");
    try {
      const candidate = recoveryInput.trim() || await cryptoServices.loadRecoveryKey(
        username,
        localPassphrase ? { passphrase: localPassphrase } : {}
      );
      setLocalPassphrase("");
      const { encoded, bytes } = cryptoServices.normalizeRecoveryKey(candidate);
      bytes.fill(0);
      await cryptoServices.confirmPendingRecoveryDevice({
        username,
        recoveryKey: encoded,
        allowActiveDevices
      });
      await cryptoServices.initializeMlsEngine({ username, recoveryKey: encoded });
      await cryptoServices.saveRecoveryKey(username, encoded);
      setRecoveryInput("");
      setRecoveryBootstrapConfirmed(false);
      setRecoveryEnrollmentConfirmed(false);
      setStatus("ready");
      onStageChange?.("preparing-messages");
      await onReady?.();
    } catch (caught) {
      setError(caught?.message || "Не удалось подтвердить восстановление криптографического устройства.");
      setStatus(allowActiveDevices ? "approval-pending" : "recovery-bootstrap");
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

  async function copyRecoveryKey() {
    if (!newRecovery || !navigator.clipboard?.writeText) return;
    await navigator.clipboard.writeText(newRecovery);
    setClipboardNotice("Ключ скопирован. Буфер будет очищен примерно через минуту, если значение не изменится.");
    window.setTimeout(async () => {
      try {
        if (await navigator.clipboard.readText() === newRecovery) {
          await navigator.clipboard.writeText("");
        }
      } catch {
        // Clipboard read/clear is best effort and may require user presence.
      }
    }, 60_000);
  }

  if (status === "ready") return children;

  return (
    <div className="crypto-gate" role="dialog" aria-modal="true" aria-labelledby="crypto-gate-title">
      <section className="crypto-gate-card" ref={cardRef} tabIndex={-1}>
        <div className="crypto-gate-symbol" aria-hidden="true"><span /></div>
        <h1 id="crypto-gate-title">
          {status === "backup-required" && "Сохраните recovery key"}
          {status === "recovery-required" && "Восстановление защищённого устройства"}
          {status === "local-passphrase" && "Подтвердите открытие recovery-хранилища"}
          {status === "reprovision" && "Безопасно пересоздать устройство"}
          {status === "approval-pending" && "Подтвердите новое устройство"}
          {status === "recovery-bootstrap" && "Подтвердите восстановление устройства"}
          {status === "error" && "Защищённое хранилище недоступно"}
          {status === "loading" && "Открываем защищённое хранилище"}
        </h1>

        {status === "loading" && <p role="status" aria-live="polite">Проверяем локальное MLS-состояние. Сообщения пока недоступны.</p>}

        {status === "local-passphrase" && <>
          <p>На этом устройстве включено дополнительное локальное подтверждение. Эта фраза не отправляется на сервер.</p>
          <input className="crypto-gate-input" type="password" autoComplete="current-password"
            value={localPassphrase} onChange={event => setLocalPassphrase(event.target.value)}
            placeholder="Локальная фраза восстановления" aria-label="Локальная фраза восстановления" />
          <button type="button" className="crypto-gate-primary" onClick={unlockLocalRecovery}
            disabled={localPassphrase.length < 10}>Открыть локальное хранилище</button>
        </>}

        {status === "approval-pending" && <>
          <p>Это устройство пока не добавлено в защищённые чаты. Откройте Liotan на уже доверенном устройстве и подтвердите запрос в разделе «Устройства».</p>
          <button type="button" className="crypto-gate-primary" onClick={() => setAttempt(value => value + 1)}>
            Проверить подтверждение
          </button>
          <p>Если доверенное устройство недоступно, recovery key может добавить это устройство как новую отдельную криптографическую сущность. Существующие устройства не заменяются, а событие останется в истории безопасности.</p>
          <input className="crypto-gate-input" type="password" autoComplete="off" spellCheck="false"
            value={recoveryInput} onChange={event => setRecoveryInput(event.target.value)}
            placeholder="Recovery key (если его нет в локальном хранилище)"
            aria-label="Recovery key для добавления устройства" />
          {localProtectionRequired && !recoveryInput.trim() && <input className="crypto-gate-input"
            type="password" autoComplete="current-password" value={localPassphrase}
            onChange={event => setLocalPassphrase(event.target.value)}
            placeholder="Локальная фраза восстановления" aria-label="Локальная фраза восстановления" />}
          <label className="crypto-gate-confirm">
            <input type="checkbox" checked={recoveryEnrollmentConfirmed}
              onChange={event => setRecoveryEnrollmentConfirmed(event.target.checked)} />
            <span>Я понимаю, что это отдельное recovery-событие, изменяющее проверяемый каталог устройств</span>
          </label>
          <button type="button" className="crypto-gate-secondary"
            disabled={!recoveryEnrollmentConfirmed ||
              (localProtectionRequired && !recoveryInput.trim() && localPassphrase.length < 10)}
            onClick={() => confirmRecoveryBootstrap({ allowActiveDevices: true })}>
            Добавить новое устройство через recovery
          </button>
        </>}

        {status === "recovery-bootstrap" && <>
          <p>Активных доверенных устройств не осталось. Продолжение создаст новый криптографический bootstrap и явно отметит изменение устройств для ваших контактов.</p>
          {!recoveryInput.trim() && <p>Будет использован recovery key из локального защищённого хранилища.</p>}
          {localProtectionRequired && !recoveryInput.trim() && <input className="crypto-gate-input"
            type="password" autoComplete="current-password" value={localPassphrase}
            onChange={event => setLocalPassphrase(event.target.value)}
            placeholder="Локальная фраза восстановления" aria-label="Локальная фраза восстановления" />}
          <label className="crypto-gate-confirm">
            <input type="checkbox" checked={recoveryBootstrapConfirmed}
              onChange={event => setRecoveryBootstrapConfirmed(event.target.checked)} />
            <span>Я понимаю, что контакты увидят изменение защищённых устройств</span>
          </label>
          <button type="button" className="crypto-gate-primary"
            disabled={!recoveryBootstrapConfirmed ||
              (localProtectionRequired && !recoveryInput.trim() && localPassphrase.length < 10)}
            onClick={() => confirmRecoveryBootstrap()}>
            Подтвердить восстановление
          </button>
        </>}

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
          <button type="button" className="crypto-gate-secondary" onClick={copyRecoveryKey}>Копировать</button>
          {clipboardNotice && <small className="crypto-gate-diagnostic">{clipboardNotice}</small>}
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
