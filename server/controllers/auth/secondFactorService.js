const { consumeSecondFactor } = require("../../security/totp/secondFactor");

async function verifySecondFactorIfEnabled({ user, factor }) {
  return consumeSecondFactor({ userId: user._id, factor });
}

module.exports = { verifySecondFactorIfEnabled };
