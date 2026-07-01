const mongoose = require("mongoose");
const logger = require("./logger");

let shuttingDown = false;

function setupGracefulShutdown(server) {
  async function shutdown(signal) {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;

    logger.warn("graceful shutdown started", { signal });

    const forceTimer = setTimeout(() => {
      logger.error("graceful shutdown timeout", new Error("force exit"));
      process.exit(1);
    }, 10000);

    forceTimer.unref?.();

    try {
      await new Promise((resolve) => {
        server.close(resolve);
      });

      await mongoose.connection.close(false);
      clearTimeout(forceTimer);
      logger.info("graceful shutdown completed", { signal });
      process.exit(0);
    } catch (err) {
      clearTimeout(forceTimer);
      logger.error("graceful shutdown failed", err, { signal });
      process.exit(1);
    }
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

function setupProcessSafety() {
  process.on("unhandledRejection", (reason) => {
    logger.error(
      "unhandled promise rejection",
      reason instanceof Error ? reason : new Error(String(reason))
    );
  });

  process.on("uncaughtException", (err) => {
    logger.error("uncaught exception", err);
  });
}

module.exports = {
  setupGracefulShutdown,
  setupProcessSafety
};
