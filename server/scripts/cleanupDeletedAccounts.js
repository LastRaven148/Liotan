"use strict";

require("dotenv").config();

const mongoose = require("mongoose");
const User = require("../models/User");
const EmailCode = require("../models/EmailCode");
const deleteAccountData = require("../utils/deleteAccountData");
const { normalizeEmail, hashEmail } = require("../utils/privacy");

const CONFIRMATION = "DELETE_SELECTED_ACCOUNTS";

function splitEnv(name) {
  return String(process.env[name] || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
}

function wantsLegacySelection() {
  return String(process.env.LIOTAN_DELETE_LEGACY_WITHOUT_EMAIL || "false").toLowerCase() === "true";
}

async function resolveSelection() {
  const selected = new Map();
  const unmatchedEmailHashes = new Map();

  for (const username of splitEnv("LIOTAN_CLEANUP_USERNAMES")) {
    const user = await User.findOne({ username }, "username").lean();
    if (user) selected.set(user.username, "username");
    else console.log(`User not found: ${username}`);
  }

  for (const rawEmail of splitEnv("LIOTAN_CLEANUP_EMAILS")) {
    const email = normalizeEmail(rawEmail);
    const emailHash = hashEmail(email);
    const user = await User.findOne({ emailHash }, "username").lean();
    if (user) selected.set(user.username, "email");
    else unmatchedEmailHashes.set(emailHash, email);
  }

  if (wantsLegacySelection()) {
    const legacyUsers = await User.find({
      $or: [
        { emailHash: { $exists: false } },
        { emailHash: null },
        { emailVerified: { $ne: true } }
      ]
    }, "username").lean();
    for (const user of legacyUsers) selected.set(user.username, "unverified-legacy-account");
  }

  return { selected, unmatchedEmailHashes };
}

function printPlan(selected, unmatchedEmailHashes) {
  console.log("Account cleanup plan (dry-run):");
  for (const [username, reason] of selected) {
    console.log(`  account: ${username} (${reason})`);
  }
  for (const email of unmatchedEmailHashes.values()) {
    console.log(`  orphan email codes: ${email}`);
  }
  console.log(`Selected accounts: ${selected.size}`);
  console.log(`Selected orphan email-code sets: ${unmatchedEmailHashes.size}`);
}

async function executePlan(selected, unmatchedEmailHashes) {
  for (const username of selected.keys()) {
    const result = await deleteAccountData(username);
    if (!result.ok) throw new Error(`Selected account disappeared before deletion: ${username}`);
    console.log(`Deleted account and associated data: ${username}`);
  }

  for (const [emailHash, email] of unmatchedEmailHashes) {
    const result = await EmailCode.deleteMany({ emailHash });
    console.log(`Deleted ${result.deletedCount} orphan email codes for: ${email}`);
  }
}

async function main() {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required");
  if (
    !splitEnv("LIOTAN_CLEANUP_USERNAMES").length &&
    !splitEnv("LIOTAN_CLEANUP_EMAILS").length &&
    !wantsLegacySelection()
  ) {
    throw new Error("Refusing account cleanup without an explicit username, email, or legacy-account selector");
  }

  await mongoose.connect(process.env.MONGO_URI);
  const { selected, unmatchedEmailHashes } = await resolveSelection();
  printPlan(selected, unmatchedEmailHashes);

  if (process.env.LIOTAN_CLEANUP_CONFIRM !== CONFIRMATION) {
    console.log(`Dry-run only. Set LIOTAN_CLEANUP_CONFIRM=${CONFIRMATION} to execute this exact selector.`);
    return;
  }

  await executePlan(selected, unmatchedEmailHashes);
  console.log("Selected account cleanup complete");
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
