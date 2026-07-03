import { avatarUrl } from "../../../utils/avatarUrl";
import { SettingsSection } from "../components/SettingsPrimitives";

export default function EditProfilePage({ state, actions, labels }) {
  const {
    username,
    avatar,
    previewAvatar,
    nameValue,
    bioValue,
    saving
  } = state;
  const shownAvatar = previewAvatar || avatarUrl(avatar);
  return (
    <>
      <div className="drawer-topbar">
        <button type="button" className="drawer-icon-button" onClick={actions.closeEdit}><span className="liotan-back-icon" aria-hidden="true" /></button>
        <div className="drawer-title">{labels.editProfile}</div>
        <button type="button" className="drawer-save-button" onClick={actions.save} disabled={saving}>
          {saving ? "..." : labels.save}
        </button>
      </div>

      <label className="edit-avatar">
        <div className="settings-avatar large">
          {shownAvatar ? <img src={shownAvatar} alt="" className="avatar-image" /> : username.charAt(0).toUpperCase()}
        </div>
        <input type="file" hidden accept="image/*" onChange={actions.selectAvatar} />
      </label>

      <SettingsSection>
        <div className="settings-field-label">{labels.name}</div>
        <input
          className="settings-name-input"
          value={nameValue}
          onChange={(e) => actions.setName(e.target.value)}
          placeholder={labels.name}
          maxLength={20}
        />
        <div className="settings-field-label">{labels.username}</div>
        <div className="settings-readonly">@{username}</div>
        <div className="settings-field-label">{labels.bio}</div>
        <textarea
          className="settings-bio-input"
          value={bioValue}
          onChange={(e) => actions.setBio(e.target.value)}
          placeholder={labels.bio}
          maxLength={70}
        />
      </SettingsSection>
    </>
  );
}
