import {
  useEffect,
  useRef,
  useState
} from "react";

import { avatarUrl }
from "../../utils/avatarUrl";

import {
  getProfile,
  getGroupApi,
  searchUsers,
  updateGroupApi,
  uploadGroupAvatarApi,
  addGroupMemberApi,
  removeGroupMemberApi
} from "../../services/api";

export default function UserProfileModal({
  user,
  username,
  deleteGroupDialog,
  updateGroup,
  openUserProfile,
  onClose
}) {

  const [profile, setProfile] =
    useState(user);

  const [search, setSearch] =
    useState("");

  const [users, setUsers] =
    useState([]);

  const [adding, setAdding] =
    useState(false);

  const [editing, setEditing] =
    useState(false);

  const [name, setName] =
    useState("");

  const [description, setDescription] =
    useState("");

  const fileInputRef =
    useRef(null);

  const isGroup =
    user?.type === "group";

  useEffect(() => {

    setProfile(user);
    setSearch("");
    setUsers([]);
    setEditing(false);

    let alive = true;

    async function load() {

      if (isGroup) {
        try {
          const data =
            await getGroupApi(user.groupId);

          const normalized = {
            ...user,
            ...data,
            type: "group",
            groupId:
              data._id ||
              user.groupId,
            chatKey:
              user.chatKey ||
              `group:${data._id || user.groupId}`,
            title:
              data.name ||
              user.title,
            name:
              data.name ||
              user.name
          };

          if (alive) {
            setProfile(normalized);
            setName(normalized.name || "");
            setDescription(
              normalized.description || ""
            );
          }
        } catch {
          if (alive) {
            setProfile(user);
          }
        }

        return;
      }

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

  }, [
    user,
    isGroup
  ]);

  useEffect(() => {

    if (!isGroup) {
      return;
    }

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

          const members =
            profile?.members || [];

          setUsers(
            (data || []).filter(item =>
              !members.includes(item.username)
            )
          );
        } catch {
          setUsers([]);
        }
      }, 250);

    return () =>
      clearTimeout(timer);

  }, [
    search,
    isGroup,
    profile
  ]);

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

  const title =
    isGroup
      ? profile.title ||
        profile.name ||
        "Группа"
      : profile.username;

  const members =
    profile.memberUsers || [];

  const memberCount =
    profile.memberCount ||
    profile.members?.length ||
    members.length ||
    1;

  const canManageGroup =
    isGroup &&
    (
      profile.owner === username ||
      profile.admins?.includes(username)
    );

  function applyUpdatedGroup(updated) {

    const normalized = {
      ...profile,
      ...updated,
      type: "group",
      groupId:
        updated._id ||
        profile.groupId,
      chatKey:
        profile.chatKey ||
        `group:${updated._id || profile.groupId}`,
      title:
        updated.name ||
        profile.title,
      name:
        updated.name ||
        profile.name
    };

    setProfile(normalized);
    setName(normalized.name || "");
    setDescription(normalized.description || "");

    updateGroup?.(normalized);
  }

  async function saveGroup() {

    if (
      !isGroup ||
      !profile.groupId
    ) {
      return;
    }

    try {
      const updated =
        await updateGroupApi(
          profile.groupId,
          {
            name,
            description
          }
        );

      applyUpdatedGroup(updated);
      setEditing(false);
    } catch (err) {
      console.error(err);
    }

  }

  async function uploadAvatar(e) {

    const file =
      e.target.files?.[0];

    e.target.value = "";

    if (
      !file ||
      !isGroup ||
      !profile.groupId
    ) {
      return;
    }

    try {
      const updated =
        await uploadGroupAvatarApi(
          profile.groupId,
          file
        );

      applyUpdatedGroup(updated);
    } catch (err) {
      console.error(err);
    }

  }

  async function addMember(targetUsername) {

    if (
      !isGroup ||
      !profile.groupId ||
      adding
    ) {
      return;
    }

    setAdding(true);

    try {
      const updated =
        await addGroupMemberApi(
          profile.groupId,
          targetUsername
        );

      applyUpdatedGroup(updated);

      setSearch("");
      setUsers([]);
    } catch (err) {
      console.error(err);
    } finally {
      setAdding(false);
    }

  }

  async function removeMember(targetUsername) {

    if (
      !isGroup ||
      !profile.groupId ||
      targetUsername === profile.owner
    ) {
      return;
    }

    try {
      const updated =
        await removeGroupMemberApi(
          profile.groupId,
          targetUsername
        );

      applyUpdatedGroup(updated);
    } catch (err) {
      console.error(err);
    }

  }

  async function handleGroupDelete() {

    if (!isGroup) {
      return;
    }

    await deleteGroupDialog?.(profile);
    onClose();

  }

  function openMemberProfile(member) {

    if (!member?.username) {
      return;
    }

    openUserProfile?.({
      ...member,
      type: "private"
    });

  }

    return (
    <aside className="profile-drawer">
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

        {canManageGroup && (
          <button
            type="button"
            className="drawer-save-button"
            onClick={() =>
              editing
                ? saveGroup()
                : setEditing(true)
            }
          >
            {editing
              ? "Сохранить"
              : "Изм."}
          </button>
        )}
      </div>

      <div className="profile-drawer-main">
        <button
          type="button"
          className="profile-avatar-button"
          onClick={() =>
            canManageGroup &&
            fileInputRef.current?.click()
          }
        >
          <div className="profile-drawer-avatar">
            {profile.avatar ? (
              <img
                src={avatarUrl(profile.avatar)}
                alt=""
                className="avatar-image"
              />
            ) : (
              title
                ? title.charAt(0).toUpperCase()
                : "?"
            )}
          </div>
        </button>

        <input
          ref={fileInputRef}
          type="file"
          hidden
          accept="image/*"
          onChange={uploadAvatar}
        />

        {editing ? (
          <input
            className="group-edit-name"
            value={name}
            onChange={(e) =>
              setName(e.target.value)
            }
            maxLength={40}
          />
        ) : (
          <div className="profile-drawer-name">
            {title}
          </div>
        )}

        {isGroup && (
          <div className="settings-online">
            {memberCount} участников
          </div>
        )}
      </div>

      {isGroup ? (
        <>
          <div className="profile-info-card">
            <div className="profile-info-row">
              <div className="profile-info-icon">
                #
              </div>

              <div>
                <div className="profile-info-main">
                  {memberCount}
                </div>

                <div className="profile-info-sub">
                  участников
                </div>
              </div>
            </div>

            <div className="profile-info-row">
              <div className="profile-info-icon">
                @
              </div>

              <div>
                <div className="profile-info-main">
                  {profile.owner}
                </div>

                <div className="profile-info-sub">
                  владелец
                </div>
              </div>
            </div>

            {editing ? (
              <textarea
                className="group-edit-description"
                value={description}
                onChange={(e) =>
                  setDescription(e.target.value)
                }
                maxLength={120}
                placeholder="Описание группы"
              />
            ) : (
              profile.description?.trim() && (
                <div className="profile-info-row">
                  <div className="profile-info-icon">
                    i
                  </div>

                  <div>
                    <div className="profile-info-main">
                      {profile.description}
                    </div>

                    <div className="profile-info-sub">
                      описание
                    </div>
                  </div>
                </div>
              )
            )}
          </div>

          {canManageGroup && (
            <div className="profile-info-card">
              <div className="group-add-title">
                Добавить участника
              </div>

              <input
                className="group-add-input"
                value={search}
                onChange={(e) =>
                  setSearch(e.target.value)
                }
                placeholder="Поиск пользователя"
              />

              {users.map(item => (
                <button
                  key={item.username}
                  type="button"
                  className="group-member-row button-row"
                  onClick={() =>
                    addMember(item.username)
                  }
                >
                  <div className="avatar small-avatar">
                    {item.avatar ? (
                      <img
                        src={avatarUrl(item.avatar)}
                        alt=""
                        className="avatar-image"
                      />
                    ) : (
                      item.username
                        .charAt(0)
                        .toUpperCase()
                    )}
                  </div>

                  <div>
                    <div className="profile-info-main">
                      {item.username}
                    </div>

                    <div className="profile-info-sub">
                      добавить
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="profile-info-card">
            <div className="group-add-title">
              Участники
            </div>

            {members.map(member => (
              <div
                key={member.username}
                className="group-member-row"
              >
                <button
                  type="button"
                  className="group-member-profile"
                  onClick={() =>
                    openMemberProfile(member)
                  }
                >
                  <div className="avatar small-avatar">
                    {member.avatar ? (
                      <img
                        src={avatarUrl(member.avatar)}
                        alt=""
                        className="avatar-image"
                      />
                    ) : (
                      member.username
                        .charAt(0)
                        .toUpperCase()
                    )}
                  </div>

                  <div>
                    <div className="profile-info-main">
                      {member.username}
                    </div>

                    <div className="profile-info-sub">
                      {member.username === profile.owner
                        ? "владелец"
                        : profile.admins?.includes(member.username)
                          ? "админ"
                          : "участник"}
                    </div>
                  </div>
                </button>

                {canManageGroup &&
                  member.username !== profile.owner && (
                  <button
                    type="button"
                    className="group-member-remove"
                    onClick={() =>
                      removeMember(member.username)
                    }
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="profile-info-card">
            <button
              type="button"
              className="settings-row button-row danger-row"
              onClick={handleGroupDelete}
            >
              <span>×</span>

              <div className="settings-row-main">
                {profile.owner === username
                  ? "Удалить группу"
                  : "Выйти из группы"}
              </div>
            </button>
          </div>
        </>
      ) : (
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
      )}
    </aside>
  );

}