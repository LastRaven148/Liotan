const env = require("../config/env");
const User = require("../models/User");
const deleteAccountData = require("../utils/deleteAccountData");
const logger = require("../utils/logger");

async function cleanupLegacyAccountsOnStartup() {
  if (String(env.LIOTAN_KEEP_LEGACY_ACCOUNTS) === "true") {
    return;
  }

  const legacyUsers = await User.find(
    {
      $or: [
        { emailHash: { $exists: false } },
        { emailHash: null },
        { emailVerified: { $ne: true } }
      ]
    },
    "username"
  ).lean();

  for (const user of legacyUsers) {
    await deleteAccountData(user.username);
  }

  if (legacyUsers.length) {
    logger.warn(
      "Deleted legacy accounts without verified email",
      { count: legacyUsers.length }
    );
  }
}

module.exports = cleanupLegacyAccountsOnStartup;
