const { consumeSecondFactor } = require("../../security/totp/secondFactor");

async function verifySecondFactorIfEnabled({ user, code, backupCode }) {
  return consumeSecondFactor({ userId: user._id, code, backupCode });
}

module.exports = { verifySecondFactorIfEnabled };
