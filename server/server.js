const env = require("./config/env");
const connectDb = require("./config/db");
const { allowedOrigins } = require("./config/corsOptions");
const { server } = require("./app");
const cleanupLegacyAccountsOnStartup = require("./startup/cleanupLegacyAccounts");
const removePasswordIdentityBackups = require("./startup/removePasswordIdentityBackups");
const scheduleAttachmentCleanup = require("./startup/scheduleAttachmentCleanup");
const logger = require("./utils/logger");
const { getMailStatus } = require("./utils/mailer");
const { version } = require("./config/version");
const { assertVpsBindingSafe } = require("./security/vpsRuntimeGuard");
const { applyHttpServerHardening } = require("./security/httpServerHardening");
const { validateStartupSecurity } = require("./security/startupSecurityValidation");
const {
  setupGracefulShutdown,
  setupProcessSafety
} = require("./utils/shutdown");

setupProcessSafety();
setupGracefulShutdown(server);

assertVpsBindingSafe(env, logger);
validateStartupSecurity(env, logger);
const httpHardening = applyHttpServerHardening(server, process.env);

async function start() {
  try {
    await connectDb();
    await cleanupLegacyAccountsOnStartup();
    await removePasswordIdentityBackups();
    scheduleAttachmentCleanup(logger);

    server.listen(env.PORT, env.HOST, () => {
      logger.info("SERVER READY", {
        host: env.HOST,
        port: env.PORT,
        version,
        httpHardening
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
