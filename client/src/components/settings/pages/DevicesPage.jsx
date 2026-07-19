import { useCallback, useEffect, useState } from "react";
import { getMlsEngine } from "../../../crypto/mlsEngine";
import {
  disableRecoveryProtection,
  enableRecoveryProtection,
  getRecoveryProtectionStatus
} from "../../../crypto/recoveryStore";
import LiotanIcon from "../../common/LiotanIcon";
import { SettingsSection } from "../components/SettingsPrimitives";

const DEFAULT_CRYPTO_SERVICES = Object.freeze({
  currentDeviceId: () => getMlsEngine().deviceId,
  listDevices: () => getMlsEngine().listCryptoDevices(),
  approveDevice: deviceId => getMlsEngine().approveCryptoDevice(deviceId),
  revokeDevice: deviceId => getMlsEngine().revokeCryptoDevice(deviceId),
  getRecoveryProtectionStatus,
  enableRecoveryProtection,
  disableRecoveryProtection
});

export default function DevicesPage({
  back,
  state,
  actions,
  labels,
  cryptoServices = DEFAULT_CRYPTO_SERVICES
}) {
  const [sessionError, setSessionError] = useState("");
  const [sessionAction, setSessionAction] = useState("");
  const [cryptoDevices, setCryptoDevices] = useState([]);
  const [cryptoLoading, setCryptoLoading] = useState(true);
  const [cryptoAction, setCryptoAction] = useState("");
  const [cryptoError, setCryptoError] = useState("");
  const [cryptoNotice, setCryptoNotice] = useState("");
  const [confirmDeviceId, setConfirmDeviceId] = useState("");
  const [recoveryProtection, setRecoveryProtection] = useState(null);
  const [protectionMode, setProtectionMode] = useState("");
  const [protectionPassphrase, setProtectionPassphrase] = useState("");
  const [protectionConfirm, setProtectionConfirm] = useState("");
  const [protectionBusy, setProtectionBusy] = useState(false);
  const [protectionError, setProtectionError] = useState("");
  const current = state.sessions.find(item => item.current);
  const others = state.sessions.filter(item => !item.current);

  const loadCryptoDevices = useCallback(async () => {
    setCryptoLoading(true);
    setCryptoError("");
    try {
      const result = await cryptoServices.listDevices();
      setCryptoDevices(result.devices || []);
    } catch (error) {
      setCryptoError(error?.message || "Не удалось проверить ключи устройств");
    } finally {
      setCryptoLoading(false);
    }
  }, [cryptoServices]);

  useEffect(() => { loadCryptoDevices(); }, [loadCryptoDevices]);
  useEffect(() => {
    function handleInvalidation(event) {
      if (event?.detail?.kind === "device-list-updated") loadCryptoDevices();
    }
    window.addEventListener("liotan:account-state-invalidated", handleInvalidation);
    return () => window.removeEventListener("liotan:account-state-invalidated", handleInvalidation);
  }, [loadCryptoDevices]);
  useEffect(() => {
    cryptoServices.getRecoveryProtectionStatus(state.username)
      .then(setRecoveryProtection)
      .catch(() => setRecoveryProtection({ configured: false, requiresUserPresence: false }));
  }, [cryptoServices, state.username]);

  async function runSessionAction(name, action) {
    if (sessionAction) return;
    setSessionError("");
    setSessionAction(name);
    try {
      await action();
    } catch (error) {
      setSessionError(error?.status === 403
        ? labels.restrictedSessionMessage
        : error?.message || "Не удалось изменить активные сессии");
    } finally {
      setSessionAction("");
    }
  }

  async function runCryptoAction(device, action) {
    if (cryptoAction) return;
    setCryptoAction(device.deviceId);
    setCryptoError("");
    setCryptoNotice("");
    try {
      const result = action === "approve"
        ? await cryptoServices.approveDevice(device.deviceId)
        : await cryptoServices.revokeDevice(device.deviceId);
      const affected = Number(result?.conversationsBlocked || 0);
      setCryptoNotice(action === "approve"
        ? `Устройство подтверждено. ${affected ? `Обновляем защищённые чаты: ${affected}.` : "Оно готово к работе."}`
        : `Сессия отозвана. ${affected ? `Удаление из ${affected} защищённых чатов будет завершено MLS-коммитами.` : "Активных чатов для обновления нет."}`);
      setConfirmDeviceId("");
      await loadCryptoDevices();
    } catch (error) {
      setCryptoError(error?.message || "Не удалось изменить состояние криптографического устройства");
    } finally {
      setCryptoAction("");
    }
  }

  async function applyRecoveryProtection() {
    if (protectionBusy) return;
    setProtectionError("");
    if (protectionMode === "enable" && protectionPassphrase !== protectionConfirm) {
      setProtectionError("Фразы не совпадают");
      return;
    }
    setProtectionBusy(true);
    try {
      if (protectionMode === "enable") {
        await cryptoServices.enableRecoveryProtection(state.username, protectionPassphrase);
      } else {
        await cryptoServices.disableRecoveryProtection(state.username, protectionPassphrase);
      }
      setRecoveryProtection(await cryptoServices.getRecoveryProtectionStatus(state.username));
      setProtectionMode("");
      setProtectionPassphrase("");
      setProtectionConfirm("");
    } catch (error) {
      setProtectionError(error?.message || "Не удалось изменить защиту recovery-хранилища");
    } finally {
      setProtectionBusy(false);
    }
  }

  const currentCryptoDeviceId = getCurrentCryptoDeviceId(cryptoServices);
  const activeCryptoCount = cryptoDevices.filter(item => item.status === "active").length;

  return (
    <>
      <div className="drawer-topbar"><button className="drawer-icon-button" onClick={back}><LiotanIcon name="back" size={22} /></button><div className="drawer-title">{labels.devices}</div></div>
      <SettingsSection title={labels.thisDevice}>
        {current ? <SessionRow session={current} labels={labels} /> : <div className="settings-muted-text">{labels.noDevices}</div>}
        {others.length > 0 && <button type="button" className="settings-terminate-button" disabled={Boolean(sessionAction)} onClick={() => runSessionAction("others", actions.logoutOthers)}>{labels.terminateOthers}</button>}
        {sessionError && <div className="settings-action-error" role="alert">{sessionError}</div>}
      </SettingsSection>
      <SettingsSection title={labels.activeSessions}>
        {others.length === 0 && <div className="settings-muted-text">{labels.noOtherDevices}</div>}
        {others.map(session => <SessionRow key={session.id} session={session} labels={labels} disabled={Boolean(sessionAction)} onRevoke={() => runSessionAction(session.id, () => actions.revoke(session.id))} />)}
      </SettingsSection>
      <SettingsSection title="Устройства и ключи">
        <div className="settings-muted-text">
          Здесь показаны устройства, которым разрешено участвовать в защищённых чатах. Новый вход не получает ключи сообщений до подтверждения.
        </div>
        {cryptoLoading && <div className="settings-muted-text" role="status">Проверяем защищённые устройства…</div>}
        {!cryptoLoading && cryptoDevices.length === 0 && <div className="settings-muted-text">Защищённые устройства не найдены.</div>}
        {cryptoDevices.map(device => <CryptoDeviceRow
          key={device.deviceId}
          device={device}
          current={device.deviceId === currentCryptoDeviceId}
          activeCount={activeCryptoCount}
          busy={Boolean(cryptoAction)}
          confirming={confirmDeviceId === device.deviceId}
          onAskRevoke={() => setConfirmDeviceId(device.deviceId)}
          onCancel={() => setConfirmDeviceId("")}
          onApprove={() => runCryptoAction(device, "approve")}
          onRevoke={() => runCryptoAction(device, "revoke")}
        />)}
        {cryptoNotice && <div className="settings-action-notice" role="status">{cryptoNotice}</div>}
        {cryptoError && <div className="settings-action-error" role="alert">{cryptoError}</div>}
      </SettingsSection>
      <SettingsSection title="Локальное восстановление ключей">
        <div className="settings-muted-text">
          Дополнительная фраза шифрует recovery material поверх ключа браузера. Она остаётся только на этом устройстве и не защищает от вредоносного кода во время её ввода.
        </div>
        <div className="settings-recovery-protection-row">
          <div>
            <b>Требовать подтверждение для восстановления ключей</b>
            <small>{recoveryProtection?.requiresUserPresence ? "Включено" : "Выключено"}</small>
          </div>
          <button type="button" className={recoveryProtection?.requiresUserPresence ? "settings-mini-danger" : "settings-mini-safe"}
            onClick={() => setProtectionMode(recoveryProtection?.requiresUserPresence ? "disable" : "enable")}>
            {recoveryProtection?.requiresUserPresence ? "Выключить" : "Включить"}
          </button>
        </div>
        {protectionMode && <div className="settings-recovery-form">
          <label><span>{protectionMode === "enable" ? "Новая локальная фраза" : "Текущая локальная фраза"}</span>
            <input type="password" autoComplete="new-password" value={protectionPassphrase}
              onChange={event => setProtectionPassphrase(event.target.value)} /></label>
          {protectionMode === "enable" && <label><span>Повторите фразу</span>
            <input type="password" autoComplete="new-password" value={protectionConfirm}
              onChange={event => setProtectionConfirm(event.target.value)} /></label>}
          <div className="settings-device-confirm-actions">
            <button type="button" className="settings-mini-safe" disabled={protectionBusy || protectionPassphrase.length < 10}
              onClick={applyRecoveryProtection}>{protectionBusy ? "…" : "Сохранить"}</button>
            <button type="button" className="settings-mini-neutral" disabled={protectionBusy}
              onClick={() => { setProtectionMode(""); setProtectionError(""); setProtectionPassphrase(""); setProtectionConfirm(""); }}>Отмена</button>
          </div>
        </div>}
        {protectionError && <div className="settings-action-error" role="alert">{protectionError}</div>}
      </SettingsSection>
    </>
  );
}

function getCurrentCryptoDeviceId(cryptoServices) {
  try { return cryptoServices.currentDeviceId(); } catch { return ""; }
}

function CryptoDeviceRow({ device, current, activeCount, busy, confirming, onAskRevoke, onCancel, onApprove, onRevoke }) {
  const pending = device.status === "pending";
  const onlyActive = device.status === "active" && activeCount <= 1;
  const title = current ? "Это устройство" : `Устройство ${shortId(device.deviceId)}`;
  return (
    <div className="settings-device-row settings-crypto-device-row">
      <div className="settings-device-main">
        <div className="settings-device-name">{title} · {deviceStatus(device)}</div>
        <div className="settings-device-meta">Создано: {formatSessionTime(device.createdAt || device.manifest?.createdAt)}</div>
        <div className="settings-device-meta">Последняя активность: {formatSessionTime(device.lastSeenAt)}</div>
        <div className="settings-device-meta">Ключ: {shortFingerprint(device.credentialThumbprint)}</div>
      </div>
      {pending && device.activationMode === "device-approval" && !current &&
        <button type="button" className="settings-mini-safe" disabled={busy} onClick={onApprove}>Подтвердить</button>}
      {device.status === "active" && !confirming &&
        <button type="button" className="settings-mini-danger" disabled={busy || onlyActive} onClick={onAskRevoke}
          title={onlyActive ? "Единственное активное устройство отзывается только через recovery flow" : "Отозвать устройство"}>
          Отозвать
        </button>}
      {device.status === "active" && confirming && <div className="settings-device-confirm-actions">
        <button type="button" className="settings-mini-danger" disabled={busy} onClick={onRevoke}>Точно отозвать</button>
        <button type="button" className="settings-mini-neutral" disabled={busy} onClick={onCancel}>Отмена</button>
      </div>}
    </div>
  );
}

function SessionRow({ session, labels, onRevoke, disabled = false }) {
  return (
    <div className="settings-device-row">
      <div className="settings-device-main">
        <div className="settings-device-name">{formatDeviceName(session.deviceName, labels)}{session.current ? ` • ${labels.current}` : ""}</div>
        <div className="settings-device-meta">{labels.lastActive}: {formatSessionTime(session.lastSeenAt)}</div>
      </div>
      {onRevoke && <button type="button" className="settings-mini-danger" disabled={disabled} onClick={onRevoke}>{labels.disconnect}</button>}
    </div>
  );
}

function deviceStatus(device) {
  if (device.status === "active") return "активно";
  if (device.status === "revoked") return "отозвано";
  if (device.status === "expired") return "срок истёк";
  if (device.activationMode === "recovery-bootstrap") return "ожидает recovery-подтверждения";
  return "ожидает подтверждения";
}

function shortId(value) {
  const text = String(value || "");
  return text.length > 10 ? `${text.slice(0, 5)}…${text.slice(-4)}` : text;
}

function shortFingerprint(value) {
  return String(value || "").match(/.{1,4}/g)?.slice(0, 6).join(" ") || "—";
}

function formatDeviceName(value, labels) {
  const name = String(value || "").trim();
  if (!name) return labels.unknownDevice;
  if (/^ios device$/i.test(name)) return "iPhone";
  if (/iphone\s*\/\s*ipad/i.test(name)) return "iPhone";
  if (/iphone/i.test(name)) return name.replace(/iphone\s*\/\s*ipad\s*ios/i, "iPhone").replace(/iphone\s*\/\s*ipad/i, "iPhone");
  if (/ipad/i.test(name) && !/iphone/i.test(name)) return name.replace(/ipad\s*os/i, "iPadOS");
  return name;
}

function formatSessionTime(value) {
  if (!value) return "—";
  try { return new Date(value).toLocaleString(); } catch { return "—"; }
}
