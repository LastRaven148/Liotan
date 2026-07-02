const crypto = require("crypto");
const User = require("../models/User");
const securityPolicy = require("../security/policies/securityPolicy");
const { getSupportPolicy } = require("../security/support/supportPolicy");
const { getOrCreateUserSecurity, publicSecurityState } = require("../security/securityState");
const { encryptJson, decryptJson, randomToken, sha256 } = require("../security/crypto/secureEnvelope");
const { generateSecret, verifyTotp, otpauthUrl } = require("../security/totp/totp");
const { generateBackupCodes, consumeBackupCode } = require("../security/recovery/backupCodes");
const { getSessionRestrictionState } = require("../utils/sessionSecurity");

async function getCurrentUser(req) {
  return User.findOne({ _id: req.user.userId, username: req.user.username });
}

async function getSecurityStatus(req, res, next) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ error: "unauthorized" });
    const state = await getOrCreateUserSecurity(user);
    const sessionRestriction = await getSessionRestrictionState({
      userId: req.user.userId,
      username: req.user.username,
      sessionId: req.user.sid
    });

    res.json({
      ok: true,
      policyVersion: securityPolicy.version,
      security: publicSecurityState(state),
      restrictedSession: sessionRestriction,
      support: getSupportPolicy()
    });
  } catch (err) {
    next(err);
  }
}

async function getSecurityPolicy(req, res, next) {
  try {
    res.json({
      ok: true,
      policyVersion: securityPolicy.version,
      policies: {
        principles: securityPolicy.principles,
        emailChange: securityPolicy.emailChange,
        recovery: {
          backupCodeCount: securityPolicy.recovery.backupCodeCount,
          securityDelayMs: securityPolicy.recovery.securityDelayMs,
          supportCanGrantAccess: securityPolicy.recovery.supportCanGrantAccess,
          supportCanReset2FA: securityPolicy.recovery.supportCanReset2FA,
          supportCanViewSecrets: securityPolicy.recovery.supportCanViewSecrets
        },
        totp: {
          issuer: securityPolicy.totp.issuer,
          digits: securityPolicy.totp.digits,
          period: securityPolicy.totp.period,
          window: securityPolicy.totp.window
        },
        vault: securityPolicy.vault,
        devices: securityPolicy.devices
      },
      support: getSupportPolicy()
    });
  } catch (err) {
    next(err);
  }
}

async function startTotpSetup(req, res, next) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ error: "unauthorized" });
    const state = await getOrCreateUserSecurity(user);
    if (state.totp.enabled) {
      return res.status(409).json({ error: "totp already enabled" });
    }
    const secret = generateSecret();
    state.totp.pendingSecretEnvelope = encryptJson({ secret }, `totp:${user._id}`);
    await state.save();
    res.json({
      ok: true,
      issuer: securityPolicy.totp.issuer,
      accountName: user.username,
      manualKey: secret,
      otpauthUrl: otpauthUrl({ secret, accountName: user.username })
    });
  } catch (err) {
    next(err);
  }
}

async function enableTotp(req, res, next) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ error: "unauthorized" });
    const state = await getOrCreateUserSecurity(user);
    if (state.totp.enabled) {
      return res.status(409).json({ error: "totp already enabled" });
    }
    if (!state.totp.pendingSecretEnvelope) {
      return res.status(400).json({ error: "totp setup required" });
    }
    const { secret } = decryptJson(state.totp.pendingSecretEnvelope, `totp:${user._id}`);
    const verified = verifyTotp(secret, req.body?.code);
    if (!verified.ok) {
      return res.status(400).json({ error: "invalid code" });
    }
    const { codes, hashes } = generateBackupCodes();
    state.totp.enabled = true;
    state.totp.enabledAt = new Date();
    state.totp.secretEnvelope = state.totp.pendingSecretEnvelope;
    state.totp.pendingSecretEnvelope = null;
    state.totp.lastUsedStep = verified.step;
    state.totp.backupCodeHashes = hashes;
    await state.save();
    res.json({ ok: true, backupCodes: codes });
  } catch (err) {
    next(err);
  }
}

async function disableTotp(req, res, next) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ error: "unauthorized" });
    const state = await getOrCreateUserSecurity(user);
    if (!state.totp.enabled) {
      return res.json({ ok: true });
    }
    const { secret } = decryptJson(state.totp.secretEnvelope, `totp:${user._id}`);
    const verified = verifyTotp(secret, req.body?.code, { lastUsedStep: state.totp.lastUsedStep });
    const backup = !verified.ok ? consumeBackupCode(state.totp.backupCodeHashes || [], req.body?.backupCode) : { ok: false };
    if (!verified.ok && !backup.ok) {
      return res.status(400).json({ error: "invalid code" });
    }
    state.totp.enabled = false;
    state.totp.enabledAt = null;
    state.totp.secretEnvelope = null;
    state.totp.pendingSecretEnvelope = null;
    state.totp.lastUsedStep = null;
    state.totp.backupCodeHashes = [];
    await state.save();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function prepareVault(req, res, next) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ error: "unauthorized" });
    const state = await getOrCreateUserSecurity(user);
    if (["prepared", "active", "locked"].includes(state.vault.status)) {
      return res.json({
        ok: true,
        vault: publicSecurityState(state).vault
      });
    }
    const vaultId = randomToken(18);
    const salt = crypto.randomBytes(16).toString("base64url");
    state.vault.status = "prepared";
    state.vault.vaultId = vaultId;
    state.vault.kdf = {
      name: securityPolicy.vault.kdf,
      iterations: securityPolicy.vault.kdfIterations,
      salt
    };
    state.vault.createdAt = new Date();
    await state.save();
    res.json({
      ok: true,
      vault: {
        status: state.vault.status,
        vaultId,
        kdf: state.vault.kdf,
        serverStoresPlaintextVaultKey: false,
        serverCanRecoverVault: false
      }
    });
  } catch (err) {
    next(err);
  }
}

async function rotateRecoveryCodes(req, res, next) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ error: "unauthorized" });
    const state = await getOrCreateUserSecurity(user);
    const { codes, hashes } = generateBackupCodes();
    state.recovery.backupCodeHashes = hashes;
    await state.save();
    res.json({ ok: true, backupCodes: codes });
  } catch (err) {
    next(err);
  }
}

async function setRecoveryPhraseVerifier(req, res, next) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ error: "unauthorized" });
    const verifier = String(req.body?.verifier || "").trim();
    if (!/^[a-f0-9]{64}$/i.test(verifier)) {
      return res.status(400).json({ error: "invalid verifier" });
    }
    const state = await getOrCreateUserSecurity(user);
    state.recovery.recoveryPhraseVerifier = sha256(`${user._id}:${verifier}`);
    await state.save();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getSecurityStatus,
  getSecurityPolicy,
  startTotpSetup,
  enableTotp,
  disableTotp,
  prepareVault,
  rotateRecoveryCodes,
  setRecoveryPhraseVerifier
};
