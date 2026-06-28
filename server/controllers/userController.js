const bcrypt =
  require("bcrypt");

const User =
  require("../models/User");

const Message =
  require("../models/Messages");

const Group =
  require("../models/Group");

const deleteUploadedFile =
  require("../utils/deleteUploadedFile");

const {
  isValidUsername,
  isValidPassword
} = require("../utils/validators");

function escapeRegex(value) {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

function isValidChatKey(value) {

  if (isValidUsername(value)) {
    return true;
  }

  return /^group:[a-fA-F0-9]{24}$/.test(value);

}

function getDevKey(req) {

  return String(
    req.headers["x-dev-admin-key"] ||
    req.query.devKey ||
    ""
  );

}

function hasDevAccess(req) {

  const key =
    getDevKey(req);

  return Boolean(
    process.env.DEV_ADMIN_KEY &&
    key &&
    key === process.env.DEV_ADMIN_KEY
  );

}

function requireDevAccess(req, res) {

  if (hasDevAccess(req)) {
    return true;
  }

  res.status(403).json({
    error: "dev access denied"
  });

  return false;

}

async function deleteMessagesWithFiles(filter) {

  const messages =
    await Message.find(filter);

  for (const msg of messages) {
    await deleteUploadedFile(
      msg.attachment?.url
    );
  }

  await Message.deleteMany(filter);

}

async function deleteUserCompletely(username) {

  const user =
    await User.findOne({
      username
    });

  if (!user) {
    return {
      ok: false,
      error: "user not found"
    };
  }

  await deleteUploadedFile(
    user.avatar
  );

  const ownedGroups =
    await Group.find({
      owner: username
    });

  const ownedGroupIds =
    ownedGroups.map(group =>
      group._id
    );

  const ownedGroupChatKeys =
    ownedGroupIds.map(id =>
      `group:${id.toString()}`
    );

  for (const group of ownedGroups) {
    await deleteUploadedFile(
      group.avatar
    );
  }

  if (ownedGroupIds.length) {
    await deleteMessagesWithFiles({
      chatType: "group",
      groupId: {
        $in: ownedGroupIds
      }
    });

    await Group.deleteMany({
      _id: {
        $in: ownedGroupIds
      }
    });
  }

  await deleteMessagesWithFiles({
    $or: [
      { from: username },
      { to: username }
    ]
  });

  await User.updateMany(
    {},
    {
      $pull: {
        pinnedChats: {
          $in: [
            username,
            ...ownedGroupChatKeys
          ]
        },
        archivedChats: {
          $in: [
            username,
            ...ownedGroupChatKeys
          ]
        }
      }
    }
  );

  await Group.updateMany(
    {},
    {
      $pull: {
        members: username,
        admins: username
      }
    }
  );

  const emptyGroups =
    await Group.find({
      members: {
        $size: 0
      }
    });

  for (const group of emptyGroups) {
    await deleteUploadedFile(
      group.avatar
    );

    await deleteMessagesWithFiles({
      chatType: "group",
      groupId: group._id
    });
  }

  await Group.deleteMany({
    members: {
      $size: 0
    }
  });

  await User.deleteOne({
    username
  });

  return {
    ok: true,
    deletedUsername: username
  };

}

async function getUsers(req, res, next) {
  try {
    const users =
      await User.find({}, "username");

    res.json(
      users.map(u => u.username).filter(Boolean)
    );
  } catch (err) {
    next(err);
  }
}

async function searchUsers(req, res, next) {
  try {
    const currentUsername =
      req.user.username;

    const query =
      String(req.query.q || "").trim();

    if (
      query.length < 1 ||
      query.length > 15 ||
      !/^[a-zA-Z0-9_]+$/.test(query)
    ) {
      return res.json([]);
    }

    const escaped =
      escapeRegex(query);

    const exact =
      await User.findOne(
        {
          $and: [
            {
              username: {
                $regex: `^${escaped}$`,
                $options: "i"
              }
            },
            {
              username: {
                $ne: currentUsername
              }
            }
          ]
        },
        "username displayName avatar bio"
      );

    if (exact) {
      return res.json([exact]);
    }

    const users =
      await User.find(
        {
          $and: [
            {
              username: {
                $regex: `^${escaped}`,
                $options: "i"
              }
            },
            {
              username: {
                $ne: currentUsername
              }
            }
          ]
        },
        "username displayName avatar bio"
      ).limit(20);

    res.json(users);
  } catch (err) {
    next(err);
  }
}

async function getPinnedChats(req, res, next) {
  try {
    const user =
      await User.findOne(
        { username: req.user.username },
        "pinnedChats"
      );

    res.json({
      pinnedChats: user?.pinnedChats || []
    });
  } catch (err) {
    next(err);
  }
}

async function togglePinnedChat(req, res, next) {
  try {
    const username =
      req.user.username;

    const chatKey =
      String(req.body.username || "").trim();

    if (!isValidChatKey(chatKey)) {
      return res.status(400).json({
        error: "invalid chat"
      });
    }

    const user =
      await User.findOne({ username });

    if (!user) {
      return res.status(404).json({
        error: "not found"
      });
    }

    const current =
      user.pinnedChats || [];

    user.pinnedChats =
      current.includes(chatKey)
        ? current.filter(item => item !== chatKey)
        : [chatKey, ...current];

    await user.save();

    res.json({
      pinnedChats: user.pinnedChats
    });
  } catch (err) {
    next(err);
  }
}

async function getArchivedChats(req, res, next) {
  try {
    const user =
      await User.findOne(
        { username: req.user.username },
        "archivedChats"
      );

    res.json({
      archivedChats: user?.archivedChats || []
    });
  } catch (err) {
    next(err);
  }
}

async function toggleArchivedChat(req, res, next) {
  try {
    const username =
      req.user.username;

    const chatKey =
      String(req.body.username || "").trim();

    if (!isValidChatKey(chatKey)) {
      return res.status(400).json({
        error: "invalid chat"
      });
    }

    const user =
      await User.findOne({ username });

    if (!user) {
      return res.status(404).json({
        error: "not found"
      });
    }

    const current =
      user.archivedChats || [];

    user.archivedChats =
      current.includes(chatKey)
        ? current.filter(item => item !== chatKey)
        : [chatKey, ...current];

    await user.save();

    res.json({
      archivedChats: user.archivedChats
    });
  } catch (err) {
    next(err);
  }
}

async function devAdminPage(req, res) {

  const devKey =
    getDevKey(req);

  if (!hasDevAccess(req)) {
    return res
      .status(403)
      .type("html")
      .send(`
        <!doctype html>
        <html lang="ru">
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>Liotan Dev Admin</title>
            <style>
              body {
                margin: 0;
                min-height: 100vh;
                background: #0e1621;
                color: #e5edf5;
                font-family: Arial, sans-serif;
                display: flex;
                align-items: center;
                justify-content: center;
              }

              .box {
                width: min(440px, calc(100vw - 32px));
                background: #17212b;
                border: 1px solid #243342;
                border-radius: 16px;
                padding: 20px;
              }

              input {
                width: 100%;
                height: 42px;
                box-sizing: border-box;
                border: 1px solid #2f4052;
                border-radius: 10px;
                background: #0e1621;
                color: white;
                padding: 0 12px;
                font-size: 15px;
              }

              button {
                margin-top: 12px;
                width: 100%;
                height: 42px;
                border: 0;
                border-radius: 10px;
                background: #3390ec;
                color: white;
                font-weight: 700;
                cursor: pointer;
              }
            </style>
          </head>

          <body>
            <div class="box">
              <h2>Liotan Dev Admin</h2>
              <p>Введите DEV_ADMIN_KEY.</p>
              <input id="key" placeholder="DEV_ADMIN_KEY" />
              <button onclick="go()">Открыть</button>
            </div>

            <script>
              function go() {
                const key = document.getElementById("key").value.trim();
                if (!key) return;
                location.href = "/dev/admin?devKey=" + encodeURIComponent(key);
              }
            </script>
          </body>
        </html>
      `);
  }

  res
    .type("html")
    .send(`
      <!doctype html>
      <html lang="ru">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Liotan Dev Admin</title>

          <style>
            * {
              box-sizing: border-box;
            }

            body {
              margin: 0;
              min-height: 100vh;
              background: #0e1621;
              color: #e5edf5;
              font-family: Arial, sans-serif;
            }

            .page {
              max-width: 980px;
              margin: 0 auto;
              padding: 18px;
            }

            .header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 12px;
              margin-bottom: 16px;
            }

            h1 {
              font-size: 24px;
              margin: 0;
            }

            .muted {
              color: #8fa4b8;
              font-size: 13px;
            }

            .toolbar {
              display: flex;
              gap: 8px;
              margin-bottom: 14px;
            }

            input {
              flex: 1;
              height: 42px;
              border: 1px solid #2f4052;
              border-radius: 10px;
              background: #17212b;
              color: white;
              padding: 0 12px;
              font-size: 15px;
            }

            button {
              border: 0;
              border-radius: 10px;
              background: #243342;
              color: white;
              padding: 0 14px;
              height: 42px;
              cursor: pointer;
              font-weight: 700;
            }

            button.primary {
              background: #3390ec;
            }

            button.danger {
              background: #d94f4f;
            }

            button.warning {
              background: #b77822;
            }

            button:disabled {
              opacity: .55;
              cursor: default;
            }

            .card {
              background: #17212b;
              border: 1px solid #243342;
              border-radius: 14px;
              padding: 14px;
              margin-bottom: 10px;
            }

            .user-row {
              display: grid;
              grid-template-columns: 1fr auto;
              gap: 12px;
              align-items: center;
            }

            .username {
              font-size: 17px;
              font-weight: 800;
            }

            .info {
              display: flex;
              flex-wrap: wrap;
              gap: 10px;
              margin-top: 6px;
              color: #8fa4b8;
              font-size: 13px;
            }

            .actions {
              display: flex;
              flex-wrap: wrap;
              gap: 8px;
              justify-content: flex-end;
            }

            .status {
              margin: 12px 0;
              color: #8fa4b8;
              font-size: 14px;
              min-height: 20px;
            }

            .password-box {
              margin-top: 8px;
              padding: 10px;
              border-radius: 10px;
              background: #0e1621;
              color: #9bd67e;
              font-family: monospace;
              display: none;
            }

            @media (max-width: 700px) {
              .header {
                display: block;
              }

              .toolbar {
                flex-direction: column;
              }

              .user-row {
                grid-template-columns: 1fr;
              }

              .actions {
                justify-content: stretch;
              }

              .actions button {
                flex: 1;
              }
            }
          </style>
        </head>

        <body>
          <div class="page">
            <div class="header">
              <div>
                <h1>Liotan Dev Admin</h1>
                <div class="muted">
                  Список пользователей, сброс пароля и полное удаление тестовых аккаунтов.
                </div>
              </div>

              <button class="primary" onclick="loadUsers()">
                Обновить
              </button>
            </div>

            <div class="toolbar">
              <input
                id="filter"
                placeholder="Фильтр по username..."
                oninput="renderUsers()"
              />
            </div>

            <div id="status" class="status">
              Загрузка...
            </div>

            <div id="list"></div>
          </div>

          <script>
            const DEV_KEY = ${JSON.stringify(devKey)};
            let users = [];

            function api(path, options) {
              const separator = path.includes("?") ? "&" : "?";

              return fetch(
                path + separator + "devKey=" + encodeURIComponent(DEV_KEY),
                options
              ).then(async (res) => {
                const data = await res.json().catch(() => ({}));

                if (!res.ok) {
                  throw new Error(data.error || "request failed");
                }

                return data;
              });
            }

            function setStatus(value) {
              document.getElementById("status").textContent = value;
            }

            function formatDate(value) {
              if (!value) return "нет данных";

              const date = new Date(value);

              if (Number.isNaN(date.getTime())) {
                return "нет данных";
              }

              return date.toLocaleString();
            }

            function escapeHtml(value) {
              return String(value || "")
                .replaceAll("&", "&amp;")
                .replaceAll("<", "&lt;")
                .replaceAll(">", "&gt;")
                .replaceAll('"', "&quot;")
                .replaceAll("'", "&#039;");
            }

            async function loadUsers() {
              try {
                setStatus("Загрузка...");

                const data = await api("/dev/users");

                users = data.users || [];

                setStatus("Пользователей: " + users.length);

                renderUsers();
              } catch (err) {
                setStatus("Ошибка: " + err.message);
              }
            }

            function renderUsers() {
              const filter =
                document.getElementById("filter").value.trim().toLowerCase();

              const list =
                document.getElementById("list");

              const filtered =
                users.filter(user =>
                  user.username.toLowerCase().includes(filter)
                );

              if (!filtered.length) {
                list.innerHTML =
                  '<div class="card muted">Пользователи не найдены.</div>';
                return;
              }

              list.innerHTML =
                filtered.map(user => {
                  const username = escapeHtml(user.username);
                  const encoded = encodeURIComponent(user.username);

                  return \`
                    <div class="card" id="user-\${encoded}">
                      <div class="user-row">
                        <div>
                          <div class="username">\${username}</div>

                          <div class="info">
                            <span>ID: \${escapeHtml(user.id)}</span>
                            <span>Last seen: \${escapeHtml(formatDate(user.lastSeen))}</span>
                            <span>Pinned: \${user.pinnedChats.length}</span>
                            <span>Archived: \${user.archivedChats.length}</span>
                          </div>

                          <div class="password-box" id="pass-\${encoded}"></div>
                        </div>

                        <div class="actions">
                          <button
                            class="warning"
                            onclick="resetPassword('\${encoded}', '\${username}')"
                          >
                            Сбросить пароль
                          </button>

                          <button
                            class="danger"
                            onclick="deleteUser('\${encoded}', '\${username}')"
                          >
                            Удалить
                          </button>
                        </div>
                      </div>
                    </div>
                  \`;
                }).join("");
            }

            async function resetPassword(encodedUsername, username) {
              const ok =
                confirm("Сбросить пароль пользователя " + username + " на 123456789?");

              if (!ok) {
                return;
              }

              try {
                setStatus("Сбрасываю пароль...");

                const data =
                  await api(
                    "/dev/users/" + encodedUsername + "/reset-password",
                    {
                      method: "PATCH",
                      headers: {
                        "Content-Type": "application/json"
                      },
                      body: JSON.stringify({
                        password: "123456789"
                      })
                    }
                  );

                const box =
                  document.getElementById("pass-" + encodedUsername);

                box.style.display = "block";
                box.textContent =
                  "Новый пароль для " + data.username + ": " + data.password;

                setStatus("Пароль сброшен.");
              } catch (err) {
                setStatus("Ошибка: " + err.message);
              }
            }

            async function deleteUser(encodedUsername, username) {
              const ok =
                confirm(
                  "Удалить пользователя " + username + " полностью?\\n\\n" +
                  "Будут удалены аккаунт, личные сообщения, вложения и группы владельца."
                );

              if (!ok) {
                return;
              }

              try {
                setStatus("Удаляю пользователя...");

                await api(
                  "/dev/users/" + encodedUsername,
                  {
                    method: "DELETE"
                  }
                );

                users =
                  users.filter(user =>
                    user.username !== username
                  );

                setStatus("Пользователь " + username + " удалён.");

                renderUsers();
              } catch (err) {
                setStatus("Ошибка: " + err.message);
              }
            }

            loadUsers();
          </script>
        </body>
      </html>
    `);

}

async function devListUsers(req, res, next) {

  try {

    if (!requireDevAccess(req, res)) {
      return;
    }

    const users =
      await User.find(
        {},
        "username avatar bio lastSeen pinnedChats archivedChats"
      ).sort({
        username: 1
      });

    res.json({
      users: users.map(user => ({
        id: user._id.toString(),
        username: user.username,
        avatar: user.avatar || "",
        bio: user.bio || "",
        lastSeen: user.lastSeen || null,
        pinnedChats: user.pinnedChats || [],
        archivedChats: user.archivedChats || []
      }))
    });

  } catch (err) {
    next(err);
  }

}

async function devResetUserPassword(req, res, next) {

  try {

    if (!requireDevAccess(req, res)) {
      return;
    }

    const username =
      String(req.params.username || "").trim();

    const password =
      String(req.body.password || "123456789");

    if (
      !isValidUsername(username) ||
      !isValidPassword(password)
    ) {
      return res.status(400).json({
        error: "invalid credentials"
      });
    }

    const user =
      await User.findOne({
        username
      });

    if (!user) {
      return res.status(404).json({
        error: "user not found"
      });
    }

    user.password =
      await bcrypt.hash(
        password,
        10
      );

    await user.save();

    res.json({
      ok: true,
      username,
      password
    });

  } catch (err) {
    next(err);
  }

}

async function devDeleteUser(req, res, next) {

  try {

    if (!requireDevAccess(req, res)) {
      return;
    }

    const username =
      String(req.params.username || "").trim();

    if (!isValidUsername(username)) {
      return res.status(400).json({
        error: "invalid username"
      });
    }

    const result =
      await deleteUserCompletely(username);

    if (!result.ok) {
      return res.status(404).json({
        error: result.error
      });
    }

    res.json(result);

  } catch (err) {
    next(err);
  }

}

module.exports = {
  getUsers,
  searchUsers,
  getPinnedChats,
  togglePinnedChat,
  getArchivedChats,
  toggleArchivedChat,
  devAdminPage,
  devListUsers,
  devResetUserPassword,
  devDeleteUser,
  deleteUserCompletely
};