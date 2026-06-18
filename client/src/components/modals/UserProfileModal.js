import {
  useEffect,
  useState
} from "react";

import { avatarUrl }
from "../../utils/avatarUrl";

import { getProfile }
from "../../services/api";

export default function UserProfileModal({
  user,
  onClose
}) {

  const [
    profile,
    setProfile
  ] = useState(user);

  useEffect(() => {

    let alive = true;

    async function load() {
      try {
        const data =
          await getProfile(user.username);

        if (alive) {
          setProfile(data);
        }
      } catch {
        if (alive) {
          setProfile(user);
        }
      }
    }

    if (user?.username) {
      load();
    }

    return () => {
      alive = false;
    };

  }, [user]);

  useEffect(() => {

    function handleEsc(e) {
      if (e.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener(
      "keydown",
      handleEsc
    );

    return () =>
      window.removeEventListener(
        "keydown",
        handleEsc
      );

  }, [onClose]);

  if (!profile) {
    return null;
  }

  return (
    <div
      className="drawer-overlay drawer-overlay-right"
      onClick={onClose}
    >
      <aside
        className="profile-drawer"
        onClick={(e) =>
          e.stopPropagation()
        }
      >
        <div className="drawer-topbar">
          <button
            type="button"
            className="drawer-icon-button"
            onClick={onClose}
          >
            ×
          </button>

          <div className="drawer-title">
            Информация
          </div>
        </div>

        <div className="profile-drawer-main">
          <div className="profile-drawer-avatar">
            {profile.avatar ? (
              <img
                src={avatarUrl(profile.avatar)}
                alt=""
                className="avatar-image"
              />
            ) : (
              profile.username
                .charAt(0)
                .toUpperCase()
            )}
          </div>

          <div className="profile-drawer-name">
            {profile.username}
          </div>
        </div>

        <div className="profile-info-card">
          <div className="profile-info-row">
            <div className="profile-info-icon">
              @
            </div>

            <div>
              <div className="profile-info-main">
                {profile.username}
              </div>

              <div className="profile-info-sub">
                имя пользователя
              </div>
            </div>
          </div>

          {profile.bio?.trim() && (
            <div className="profile-info-row">
              <div className="profile-info-icon">
                i
              </div>

              <div>
                <div className="profile-info-main">
                  {profile.bio}
                </div>

                <div className="profile-info-sub">
                  о себе
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );

}