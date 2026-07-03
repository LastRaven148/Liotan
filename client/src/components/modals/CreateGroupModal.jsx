import {
  useEffect,
  useState
} from "react";

import {
  createGroupApi,
  searchUsers
} from "../../services/api";

import LiotanIcon from "../common/LiotanIcon";

function BackIcon() {
  return <LiotanIcon name="back" size={22} />;
}

function GroupAvatarIcon() {
  return <LiotanIcon name="group" size={58} />;
}

const SIDEBAR_WIDTH = 360;

const overlayStyle = {
  position: "fixed",
  left: 0,
  top: 0,
  bottom: 0,
  width: SIDEBAR_WIDTH,
  maxWidth: "100vw",
  background: "transparent",
  zIndex: 9000,
  overflow: "hidden"
};

const drawerStyle = {
  position: "relative",
  width: SIDEBAR_WIDTH,
  minWidth: 0,
  maxWidth: "100%",
  height: "100dvh",
  background: "#17212b",
  color: "#ffffff",
  borderRight: "1px solid #0f1923",
  boxSizing: "border-box",
  overflow: "hidden"
};

const topbarStyle = {
  height: 56,
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "0 16px",
  boxSizing: "border-box"
};

const backButtonStyle = {
  width: 36,
  height: 36,
  border: 0,
  borderRadius: "50%",
  background: "transparent",
  color: "#d7dde5",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  cursor: "pointer",
  flexShrink: 0
};

const titleStyle = {
  flex: 1,
  minWidth: 0,
  color: "#ffffff",
  fontSize: 16,
  lineHeight: "20px",
  fontWeight: 700,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis"
};

const formStyle = {
  width: "100%",
  maxWidth: "100%",
  padding: "0 16px 92px",
  boxSizing: "border-box"
};

const searchWrapStyle = {
  width: "100%",
  maxWidth: "100%",
  height: 44,
  minHeight: 44,
  padding: "0 14px",
  display: "flex",
  alignItems: "center",
  gap: 10,
  borderRadius: 22,
  background: "#242f3d",
  boxSizing: "border-box",
  overflow: "hidden",
  margin: "6px 0 14px"
};

const searchIconStyle = {
  width: 22,
  minWidth: 22,
  height: 22,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#8fa4b8",
  pointerEvents: "none"
};

const searchInputStyle = {
  flex: "1 1 auto",
  minWidth: 0,
  width: "100%",
  height: "100%",
  padding: 0,
  margin: 0,
  border: 0,
  outline: 0,
  background: "transparent",
  color: "#ffffff",
  fontFamily: "inherit",
  fontSize: 15,
  lineHeight: "44px",
  boxSizing: "border-box"
};

const nameHeroStyle = {
  width: "100%",
  maxWidth: "100%",
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  gap: 12,
  boxSizing: "border-box"
};

const avatarPreviewStyle = {
  width: 92,
  height: 92,
  margin: "16px auto 10px",
  borderRadius: "50%",
  background: "#8774e1",
  color: "#ffffff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0
};

const nameInputStyle = {
  width: "100%",
  maxWidth: "100%",
  height: 44,
  minHeight: 44,
  margin: 0,
  padding: "0 14px",
  border: 0,
  outline: 0,
  borderRadius: 12,
  background: "#242f3d",
  color: "#ffffff",
  fontFamily: "inherit",
  fontSize: 15,
  lineHeight: "44px",
  boxSizing: "border-box"
};

const hintStyle = {
  color: "#8da2b5",
  fontSize: 13,
  lineHeight: "18px"
};

const nextButtonStyle = {
  position: "absolute",
  right: 18,
  bottom: 18,
  width: 56,
  height: 56,
  minWidth: 56,
  minHeight: 56,
  maxWidth: 56,
  maxHeight: 56,
  border: 0,
  borderRadius: "50%",
  background: "#8774e1",
  color: "#ffffff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  boxShadow: "0 8px 22px rgba(0,0,0,.34)",
  cursor: "pointer",
  boxSizing: "border-box"
};

const usersPanelStyle = {
  width: "100%",
  maxWidth: "100%",
  boxSizing: "border-box"
};

export default function CreateGroupModal({
  onClose,
  onCreated
}) {

  const [step, setStep] =
    useState("members");

  const [name, setName] =
    useState("");

  const [search, setSearch] =
    useState("");

  const [users, setUsers] =
    useState([]);

  const [selected, setSelected] =
    useState([]);

  const [loading, setLoading] =
    useState(false);

  useEffect(() => {

    function handleEscape(event) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleEscape);

    return () =>
      window.removeEventListener("keydown", handleEscape);

  }, [onClose]);

  useEffect(() => {

    const query =
      search.trim();

    if (!query) {
      setUsers([]);
      return;
    }

    const timer =
      setTimeout(async () => {
        try {
          const data =
            await searchUsers(query);

          setUsers(data || []);
        } catch (err) {
          if (import.meta.env.DEV) console.warn(err);
          setUsers([]);
        }
      }, 250);

    return () =>
      clearTimeout(timer);

  }, [search]);

  function toggleUser(username) {

    setSelected(prev =>
      prev.includes(username)
        ? prev.filter(item => item !== username)
        : [...prev, username]
    );

  }

  function goBack() {
    if (step === "name") {
      setStep("members");
      return;
    }

    onClose();
  }

  function continueFlow() {
    if (step === "members") {
      setStep("name");
      return;
    }

    createGroup();
  }

  async function createGroup() {

    const cleanName =
      name.trim();

    if (
      loading ||
      !cleanName
    ) {
      return;
    }

    setLoading(true);

    try {

      const group =
        await createGroupApi({
          name: cleanName,
          members: selected
        });

      onCreated?.(group);
      onClose();

    } catch (err) {
      if (import.meta.env.DEV) console.warn(err);
    } finally {
      setLoading(false);
    }

  }

  const canContinue =
    step === "members"
      ? true
      : Boolean(name.trim()) && !loading;

  return (
    <div
      style={overlayStyle}
      onClick={onClose}
    >
      <aside
        style={drawerStyle}
        onClick={(e) =>
          e.stopPropagation()
        }
      >
        <div style={topbarStyle}>
          <button
            type="button"
            style={backButtonStyle}
            onClick={goBack}
            aria-label="Назад"
          >
            <BackIcon />
          </button>

          <div style={titleStyle}>
            {step === "members"
              ? "Добавить участников"
              : "Новая группа"}
          </div>
        </div>

        {step === "members" ? (
          <div style={formStyle}>
            <div style={searchWrapStyle}>
              <span style={searchIconStyle} aria-hidden="true"><LiotanIcon name="search" size={21} /></span>
              <input
                value={search}
                onChange={(e) =>
                  setSearch(e.target.value)
                }
                placeholder="Поиск"
                style={searchInputStyle}
              />
            </div>

            {selected.length > 0 && (
              <div className="selected-users create-group-selected-users">
                {selected.map(item => (
                  <button
                    key={item}
                    type="button"
                    onClick={() =>
                      toggleUser(item)
                    }
                  >
                    {item} ×
                  </button>
                ))}
              </div>
            )}

            <div className="create-group-users" style={usersPanelStyle}>
              {users.map(user => {
                const active =
                  selected.includes(user.username);

                return (
                  <button
                    key={user.username}
                    type="button"
                    className={
                      active
                        ? "create-group-user selected"
                        : "create-group-user"
                    }
                    onClick={() =>
                      toggleUser(user.username)
                    }
                  >
                    <span className={active ? "create-group-check active" : "create-group-check"} />

                    <div className="avatar small-avatar">
                      {user.avatar ? (
                        <img
                          src={user.avatar}
                          alt=""
                          className="avatar-image"
                        />
                      ) : (
                        user.username
                          .charAt(0)
                          .toUpperCase()
                      )}
                    </div>

                    <div>
                      <div className="create-group-user-name">
                        {user.username}
                      </div>

                      <div className="create-group-user-sub">
                        {active
                          ? "выбран"
                          : "был(а) недавно"}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div style={formStyle}>
            <div style={nameHeroStyle}>
              <div style={avatarPreviewStyle}>
                <GroupAvatarIcon />
              </div>
              <input
                value={name}
                onChange={(e) =>
                  setName(e.target.value)
                }
                maxLength={40}
                placeholder="Название группы"
                style={nameInputStyle}
                autoFocus
              />
              <div style={hintStyle}>
                Участников: {selected.length}
              </div>
            </div>
          </div>
        )}

        <button
          type="button"
          style={nextButtonStyle}
          disabled={!canContinue}
          onClick={continueFlow}
          aria-label="Продолжить"
        >
          <LiotanIcon name="arrowRight" size={27} />
        </button>
      </aside>
    </div>
  );

}
