import {
  useEffect,
  useState
} from "react";

import {
  createGroupApi,
  searchUsers
} from "../../services/api";

export default function CreateGroupModal({
  onClose,
  onCreated
}) {

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
          console.error(err);
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
      console.error(err);
    } finally {
      setLoading(false);
    }

  }

  return (
    <div
      className="drawer-overlay drawer-overlay-left"
      onClick={onClose}
    >
      <aside
        className="settings-drawer"
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
            ←
          </button>

          <div className="drawer-title">
            Создать группу
          </div>

          <button
            type="button"
            className="drawer-save-button"
            onClick={createGroup}
            disabled={
              loading ||
              !name.trim()
            }
          >
            Создать
          </button>
        </div>

        <div className="create-group-form">
          <input
            value={name}
            onChange={(e) =>
              setName(e.target.value)
            }
            maxLength={40}
            placeholder="Название группы"
            className="create-group-input"
          />

          <input
            value={search}
            onChange={(e) =>
              setSearch(e.target.value)
            }
            placeholder="Найти участников"
            className="create-group-input"
          />

          {selected.length > 0 && (
            <div className="selected-users">
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

          <div className="create-group-users">
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
                        ? "Выбран"
                        : "Нажми, чтобы выбрать"}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </aside>
    </div>
  );

}