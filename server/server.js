const env = require("./config/env");
const connectDb = require("./config/db");
const { allowedOrigins } = require("./config/corsOptions");
const { server } = require("./app");
const cleanupLegacyAccountsOnStartup = require("./startup/cleanupLegacyAccounts");
const logger = require("./utils/logger");
const { getMailStatus } = require("./utils/mailer");
const { version } = require("./config/version");
const { assertVpsBindingSafe } = require("./security/vpsRuntimeGuard");
const {
  setupGracefulShutdown,
  setupProcessSafety
} = require("./utils/shutdown");

setupProcessSafety();
setupGracefulShutdown(server);

assertVpsBindingSafe(env, logger);

async function start() {
  try {
    await connectDb();
    await cleanupLegacyAccountsOnStartup();

    server.listen(env.PORT, env.HOST, () => {
      logger.info("SERVER READY", {
        host: env.HOST,
        port: env.PORT,
        version
      });
      if (env.NODE_ENV !== "production") {
        logger.info("ALLOWED ORIGINS", { allowedOrigins });
      }
      logger.info("MAIL PROVIDER", getMailStatus());
    });
  } catch (err) {
    logger.error("SERVER START ERROR", err);
    process.exitCode = 1;
  }
}

start();
