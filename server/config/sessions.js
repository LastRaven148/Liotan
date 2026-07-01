function intEnv(name, defaultValue) {
  const parsed = Number(process.env[name]);

  return Number.isFinite(parsed) && parsed > 0
    ? Math.floor(parsed)
    : defaultValue;
}

const sessions = {
  maxActiveSessionsPerUser: intEnv("SESSION_MAX_ACTIVE_PER_USER", 10),
  ttlDays: intEnv("SESSION_TTL_DAYS", 30),
  touchThrottleMs: intEnv("SESSION_TOUCH_THROTTLE_MS", 5 * 60 * 1000),
  cleanupBatchSize: intEnv("SESSION_CLEANUP_BATCH_SIZE", 500)
};

module.exports = sessions;
