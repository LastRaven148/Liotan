require("dotenv").config();

const mongoose =
  require("mongoose");

const User =
  require("../models/User");

const Message =
  require("../models/Messages");

const Group =
  require("../models/Group");

const EmailCode =
  require("../models/EmailCode");

const E2EEKey =
  require("../models/E2EEKey");

const deleteUploadedFile =
  require("../utils/deleteUploadedFile");

const {
  normalizeEmail,
  hashEmail
} = require("../utils/privacy");

function splitEnv(name) {
  return String(process.env[name] || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

async function deleteUserCompletely(username) {
  const user =
    await User.findOne({
      username
    });

  if (!user) {
    console.log(`User not found: ${username}`);
    return;
  }

  await deleteUploadedFile({
    url: user.avatar,
    storageKey: user.avatarStorageKey,
    storageType: user.avatarStorageType
  });

  const messages =
    await Message.find({
      $or: [
        { from: username },
        { to: username },
        { deletedFor: username },
        { deletedForEveryoneBy: username }
      ]
    });

  for (const msg of messages) {
    await deleteUploadedFile({
      url: msg.attachment?.url,
      storageKey: msg.attachment?.storageKey,
      storageType: msg.attachment?.storageType
    });
  }

  await Message.deleteMany({
    $or: [
      { from: username },
      { to: username },
      { deletedFor: username },
      { deletedForEveryoneBy: username }
    ]
  });

  await User.updateMany(
    {},
    {
      $pull: {
        pinnedChats: username,
        archivedChats: username
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

  await Group.deleteMany({
    members: {
      $size: 0
    }
  });

  await E2EEKey.deleteMany({
    user: username
  });

  if (user.emailHash) {
    await EmailCode.deleteMany({
      emailHash: user.emailHash
    });
  }

  await User.deleteOne({
    username
  });

  console.log(`Deleted user: ${username}`);
}


async function deleteLegacyUsersWithoutEmail() {
  const legacyUsers =
    await User.find({
      $or: [
        { emailHash: { $exists: false } },
        { emailHash: null },
        { emailVerified: { $ne: true } }
      ]
    }, "username").lean();

  for (const user of legacyUsers) {
    await deleteUserCompletely(user.username);
  }

  console.log(`Deleted legacy users without verified email: ${legacyUsers.length}`);
}

async function main() {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is required");
  }

  await mongoose.connect(
    process.env.MONGO_URI
  );

  if (String(process.env.LIOTAN_DELETE_LEGACY_WITHOUT_EMAIL || "false") === "true") {
    await deleteLegacyUsersWithoutEmail();
  }

  const usernames =
    splitEnv("LIOTAN_CLEANUP_USERNAMES");

  const emails =
    splitEnv("LIOTAN_CLEANUP_EMAILS");

  for (const username of usernames) {
    await deleteUserCompletely(username);
  }

  for (const email of emails) {
    const emailHash =
      hashEmail(
        normalizeEmail(email)
      );

    const user =
      await User.findOne({
        emailHash
      });

    if (user) {
      await deleteUserCompletely(user.username);
    }

    await EmailCode.deleteMany({
      emailHash
    });

    console.log(`Freed email: ${normalizeEmail(email)}`);
  }

  const users =
    await User.find(
      {},
      "username emailHash"
    ).lean();

  const aliveUsers =
    new Set(
      users.map((user) => user.username)
    );

  const aliveEmailHashes =
    new Set(
      users
        .map((user) => user.emailHash)
        .filter(Boolean)
    );

  const staleKeys =
    await E2EEKey.deleteMany({
      user: {
        $nin: [...aliveUsers]
      }
    });

  const staleCodes =
    await EmailCode.deleteMany({
      emailHash: {
        $nin: [...aliveEmailHashes]
      }
    });

  console.log(`Removed stale E2EE keys: ${staleKeys.deletedCount}`);
  console.log(`Removed stale email codes: ${staleCodes.deletedCount}`);
  console.log("Cleanup complete");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
