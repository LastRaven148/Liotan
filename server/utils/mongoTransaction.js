"use strict";

const mongoose = require("mongoose");

function isRetryable(error) {
  return Boolean(
    error?.hasErrorLabel?.("TransientTransactionError") ||
    error?.hasErrorLabel?.("UnknownTransactionCommitResult") ||
    [112, 244, 251].includes(Number(error?.code))
  );
}

async function runMongoTransaction(work, options = {}) {
  const maxAttempts = Math.max(1, Math.min(Number(options.maxAttempts) || 3, 8));
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const session = await mongoose.startSession();
    try {
      let result;
      await session.withTransaction(async () => {
        result = await work(session, attempt);
      }, options.transactionOptions);
      return result;
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === maxAttempts) throw error;
    } finally {
      await session.endSession();
    }
  }
  throw lastError;
}

module.exports = { isRetryable, runMongoTransaction };
