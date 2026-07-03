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
  return <LiotanIcon name="group" size={46} />;
}

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
      className="drawer-overlay drawer-overlay-left create-group-overlay"
      onClick={onClose}
    >
      <aside
        className="settings-drawer create-group-drawer"
        onClick={(e) =>
          e.stopPropagation()
        }
      >
        <div className="drawer-topbar create-group-topbar">
          <button
            type="button"
            className="drawer-icon-button"
            onClick={goBack}
            aria-label="Назад"
          >
            <BackIcon />
          </button>

          <div className="drawer-title">
            {step === "members"
              ? "Добавить участников"
              : "Новая группа"}
          </div>
        </div>

        {step === "members" ? (
          <div className="create-group-form create-group-form-panel">
            <div className="create-group-search-wrap">
              <span className="create-group-search-icon" aria-hidden="true"><LiotanIcon name="search" size={20} /></span>
              <input
                value={search}
                onChange={(e) =>
                  setSearch(e.target.value)
                }
                placeholder="Поиск"
                className="create-group-search"
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

            <div className="create-group-users create-group-users-panel">
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
          <div className="create-group-form create-group-form-panel">
            <div className="create-group-name-hero">
              <div className="create-group-avatar-preview">
                <GroupAvatarIcon />
              </div>
              <input
                value={name}
                onChange={(e) =>
                  setName(e.target.value)
                }
                maxLength={40}
                placeholder="Название группы"
                className="create-group-name-input"
                autoFocus
              />
              <div className="create-group-name-hint">
                Участников: {selected.length}
              </div>
            </div>
          </div>
        )}

        <button
          type="button"
          className="create-group-next-button"
          disabled={!canContinue}
          onClick={continueFlow}
          aria-label="Продолжить"
        >
          <LiotanIcon name="back" size={24} className="create-group-next-icon" />
        </button>
      </aside>
    </div>
  );

}
