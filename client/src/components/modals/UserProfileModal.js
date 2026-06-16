import { useEffect } from "react";
import { avatarUrl } from "../../utils/avatarUrl";

export default function UserProfileModal({
  user,
  onClose
}) {

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

  return (

    <div
      className="modal-overlay"
      onClick={onClose}
    >

      <div
        className="profile-modal"
        onClick={(e) =>
          e.stopPropagation()
        }
      >

        <div className="profile-modal-avatar">

          {user.avatar ? (

            <img
              src={avatarUrl(user.avatar)}
              alt=""
              className="avatar-image"
            />

          ) : (

            user.username
              .charAt(0)
              .toUpperCase()

          )}

        </div>

        <div className="profile-modal-name">
          {user.username}
        </div>

        <div className="profile-modal-bio">
          {user.bio || "No bio"}
        </div>

      </div>

    </div>

  );
}