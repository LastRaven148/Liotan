import LiotanIcon from "../../common/LiotanIcon";
import { SettingsSection } from "../components/SettingsPrimitives";

export default function SupportPage({ back, labels, securityStatus }) {
  const support = securityStatus?.support || {};
  const cannotRecover = support.supportCanGrantAccess === false || support.supportCanReset2FA === false;

  return (
    <>
      <div className="drawer-topbar">
        <button type="button" className="drawer-icon-button" onClick={back} aria-label={labels.back || "Назад"}>
          <LiotanIcon name="back" size={22} />
        </button>
        <div className="drawer-title">{labels.support}</div>
      </div>
      <SettingsSection title={labels.supportSecurityTitle || "Что может поддержка"}>
        <div className="settings-muted-text">
          {cannotRecover
            ? (labels.supportSecurityText || "Поддержка не может видеть ключи, сбрасывать 2FA или возвращать доступ к зашифрованным данным. Используйте резервные коды и защищённое восстановление устройства.")
            : (labels.supportUnavailableText || "Канал поддержки пока не настроен.")}
        </div>
      </SettingsSection>
    </>
  );
}
