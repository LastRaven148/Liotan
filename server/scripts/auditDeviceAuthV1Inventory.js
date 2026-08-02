"use strict";

require("dotenv").config();
const mongoose = require("mongoose");
const connectDb = require("../config/db");
const CryptoDevice = require("../models/CryptoDevice");

async function inspect() {
  const [result] = await CryptoDevice.aggregate([
    { $match: { authVersion: { $ne: 2 } } },
    { $group: {
      _id: null,
      total: { $sum: 1 },
      active: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } },
      pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
      expired: { $sum: { $cond: [{ $eq: ["$status", "expired"] }, 1, 0] } },
      revoked: { $sum: { $cond: [{ $eq: ["$status", "revoked"] }, 1, 0] } }
    } }
  ]);
  return {
    mode: "count-only",
    authVersion: 1,
    total: Number(result?.total) || 0,
    byStatus: {
      active: Number(result?.active) || 0,
      pending: Number(result?.pending) || 0,
      expired: Number(result?.expired) || 0,
      revoked: Number(result?.revoked) || 0
    }
  };
}

async function main() {
  if (process.argv.some(value => value === "--apply" || value === "--delete")) {
    throw new Error("This inventory is permanently count-only and cannot mutate devices");
  }
  await connectDb();
  console.log(JSON.stringify(await inspect(), null, 2));
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  }).finally(() => mongoose.disconnect());
}

module.exports = { inspect };
