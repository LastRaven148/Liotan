const User = require("../models/User");
const logger = require("../utils/logger");

async function removePasswordIdentityBackups() {
  const result = await User.updateMany(
    { e2eeIdentityBackup: { $ne: null } },
    { $unset: { e2eeIdentityBackup: 1 } }
  );

  if (result.modifiedCount) {
    logger.warn("removed legacy password-encrypted E2EE identity backups", {
      count: result.modifiedCount
    });
  }
}

module.exports = removePasswordIdentityBackups;
