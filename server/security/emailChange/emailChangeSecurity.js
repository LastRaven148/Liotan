const PendingEmailChange = require("../../models/PendingEmailChange");
const User = require("../../models/User");
const UserSecurity = require("../../models/UserSecurity");
const securityPolicy = require("../policies/securityPolicy");
const { encryptJson, decryptJson, randomToken, sha256 } = require("../crypto/secureEnvelope");
const { revokeAllUserSessions } = require("../../utils/sessionSecurity");

const CANCEL_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;

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
    {
      $set: {
        status: "cancelled",
        cancelledAt: now,
        cancellationRequestedAt: null,
        cancellationFinalizedAt: now
      }
    }
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
        "highRiskLock.reason": "pending_email_change",
        "highRiskLock.pendingEmailChangeId": String(pending._id)
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

  await clearMatchingEmailChangeLock(pending);

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

async function clearMatchingEmailChangeLock(pending) {
  const pendingId = String(pending?._id || "");
  if (!pendingId) return false;

  const exact = await UserSecurity.updateOne({
    userId: pending.userId,
    "highRiskLock.reason": "pending_email_change",
    "highRiskLock.pendingEmailChangeId": pendingId
  }, {
    $set: {
      "highRiskLock.lockedUntil": null,
      "highRiskLock.reason": "",
      "highRiskLock.pendingEmailChangeId": ""
    }
  });
  if (exact.modifiedCount === 1) return true;

  const newerPending = await PendingEmailChange.exists({
    userId: pending.userId,
    status: "pending",
    _id: { $ne: pending._id }
  });
  if (newerPending) return false;

  const legacy = await UserSecurity.updateOne({
    userId: pending.userId,
    "highRiskLock.reason": "pending_email_change",
    $or: [
      { "highRiskLock.pendingEmailChangeId": "" },
      { "highRiskLock.pendingEmailChangeId": { $exists: false } }
    ]
  }, {
    $set: {
      "highRiskLock.lockedUntil": null,
      "highRiskLock.reason": "",
      "highRiskLock.pendingEmailChangeId": ""
    }
  });
  return legacy.modifiedCount === 1;
}

async function finalizeEmailChangeCancellation(pending) {
  await clearMatchingEmailChangeLock(pending);
  await revokeAllUserSessions({ userId: pending.userId });
  await PendingEmailChange.updateOne({
    _id: pending._id,
    status: "cancelled",
    cancellationRequestedAt: { $type: "date" },
    cancellationFinalizedAt: null
  }, {
    $set: { cancellationFinalizedAt: new Date() }
  });
}

async function cancelPendingEmailChange(token) {
  const cleanToken = String(token || "").trim();
  if (!CANCEL_TOKEN_PATTERN.test(cleanToken)) {
    return { ok: false };
  }

  const tokenHash = sha256(cleanToken);
  const now = new Date();
  let pending = await PendingEmailChange.findOneAndUpdate({
    cancelTokenHash: tokenHash,
    status: "pending",
    cancelExpiresAt: { $gt: now }
  }, {
    $set: {
      status: "cancelled",
      cancelledAt: now,
      cancellationRequestedAt: now,
      cancellationFinalizedAt: null
    }
  }, {
    returnDocument: "after"
  });

  if (!pending) {
    pending = await PendingEmailChange.findOne({
      cancelTokenHash: tokenHash,
      status: "cancelled",
      cancellationRequestedAt: { $type: "date" },
      cancellationFinalizedAt: null
    });
    if (pending) await finalizeEmailChangeCancellation(pending);
    return { ok: false };
  }

  await finalizeEmailChangeCancellation(pending);
  return { ok: true };
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
