const PendingEmailChange = require("../../models/PendingEmailChange");
const User = require("../../models/User");
const UserSecurity = require("../../models/UserSecurity");
const Session = require("../../models/Session");
const securityPolicy = require("../policies/securityPolicy");
const { encryptJson, decryptJson, randomToken, sha256, timingSafeEqualHex } = require("../crypto/secureEnvelope");
const { revokeAllUserSessions } = require("../../utils/sessionSecurity");

function hoursToMs(hours) {
  return Number(hours || 0) * 60 * 60 * 1000;
}

function getEmailChangeWindows() {
  const securityWindowHours = Number(securityPolicy.emailChange.securityWindowHours || 72);
  const cancelWindowHours = Number(securityPolicy.emailChange.cancelWindowHours || securityWindowHours);
  return {
    securityWindowMs: hoursToMs(securityWindowHours),
    cancelWindowMs: hoursToMs(cancelWindowHours)
  };
}

function getCancelUrl(token) {
  const base = String(process.env.PUBLIC_API_URL || process.env.API_URL || "").replace(/\/$/, "");
  const path = `/auth/email-change/cancel/${encodeURIComponent(token)}`;
  return base ? `${base}${path}` : path;
}

async function createPendingEmailChange({ user, oldEmailHash, newEmail, newEmailHash, exceptSessionId }) {
  const now = new Date();
  const { securityWindowMs, cancelWindowMs } = getEmailChangeWindows();
  const applyAfter = new Date(now.getTime() + securityWindowMs);
  const cancelExpiresAt = new Date(now.getTime() + cancelWindowMs);
  const cancelToken = randomToken(32);
  const cancelTokenHash = sha256(cancelToken);

  await PendingEmailChange.updateMany(
    { userId: user._id, status: "pending" },
    { $set: { status: "cancelled", cancelledAt: now } }
  );

  const pending = await PendingEmailChange.create({
    userId: user._id,
    username: user.username,
    oldEmailHash,
    newEmailHash,
    newEmailEnvelope: encryptJson({ email: newEmail }, `email-change:${user._id}`),
    cancelTokenHash,
    status: "pending",
    requestedAt: now,
    applyAfter,
    cancelExpiresAt
  });

  await UserSecurity.updateOne(
    { userId: user._id },
    {
      $set: {
        "highRiskLock.lockedUntil": applyAfter,
        "highRiskLock.reason": "pending_email_change"
      }
    },
    { upsert: false }
  );

  await revokeAllUserSessions({
    userId: user._id,
    exceptSessionId
  });

  return {
    pending,
    cancelToken,
    cancelUrl: getCancelUrl(cancelToken)
  };
}

async function applyPendingEmailChange(pending) {
  if (!pending || pending.status !== "pending") {
    return false;
  }
  if (pending.applyAfter > new Date()) {
    return false;
  }

  const user = await User.findOne({ _id: pending.userId, emailHash: pending.oldEmailHash });
  if (!user) {
    pending.status = "expired";
    await pending.save();
    return false;
  }

  const existing = await User.exists({ emailHash: pending.newEmailHash, _id: { $ne: pending.userId } });
  if (existing) {
    pending.status = "cancelled";
    pending.cancelledAt = new Date();
    await pending.save();
    return false;
  }

  user.emailHash = pending.newEmailHash;
  user.emailVerified = true;
  await user.save();

  pending.status = "applied";
  pending.appliedAt = new Date();
  await pending.save();

  await UserSecurity.updateOne(
    { userId: pending.userId, "highRiskLock.reason": "pending_email_change" },
    {
      $set: {
        "highRiskLock.lockedUntil": null,
        "highRiskLock.reason": ""
      }
    }
  );

  return true;
}

async function applyEligiblePendingEmailChanges({ emailHash } = {}) {
  const query = {
    status: "pending",
    applyAfter: { $lte: new Date() }
  };
  if (emailHash) {
    query.newEmailHash = emailHash;
  }

  const pendingList = await PendingEmailChange.find(query).limit(20);
  for (const pending of pendingList) {
    await applyPendingEmailChange(pending);
  }
}

async function cancelPendingEmailChange(token) {
  const tokenHash = sha256(String(token || ""));
  const pendingList = await PendingEmailChange.find({ status: "pending" }).limit(100);
  let pending = null;
  for (const item of pendingList) {
    if (timingSafeEqualHex(item.cancelTokenHash, tokenHash)) {
      pending = item;
      break;
    }
  }

  if (!pending || pending.cancelExpiresAt < new Date()) {
    return false;
  }

  pending.status = "cancelled";
  pending.cancelledAt = new Date();
  await pending.save();

  await UserSecurity.updateOne(
    { userId: pending.userId, "highRiskLock.reason": "pending_email_change" },
    {
      $set: {
        "highRiskLock.lockedUntil": null,
        "highRiskLock.reason": ""
      }
    }
  );

  await Session.updateMany(
    { userId: pending.userId, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );

  return true;
}

function getPendingNewEmail(pending) {
  if (!pending?.newEmailEnvelope) return "";
  try {
    return decryptJson(pending.newEmailEnvelope, `email-change:${pending.userId}`).email || "";
  } catch {
    return "";
  }
}

module.exports = {
  createPendingEmailChange,
  applyEligiblePendingEmailChanges,
  cancelPendingEmailChange,
  getPendingNewEmail,
  getEmailChangeWindows
};
