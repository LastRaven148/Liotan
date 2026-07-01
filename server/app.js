const express = require("express");
const http = require("http");
const path = require("path");
const helmet = require("helmet");
const cors = require("cors");
const hpp = require("hpp");
const { Server } = require("socket.io");

const env = require("./config/env");
const { corsOptions } = require("./config/corsOptions");
const { apiLimiter } = require("./middleware/rateLimiters");
const mongoSanitize = require("./middleware/mongoSanitize");
const requestContext = require("./middleware/requestContext");
const securityHeaders = require("./middleware/securityHeaders");
const { stateChangingRequestGuard } = require("./middleware/stateChangingRequestGuard");
const contentSecurityPolicy = require("./middleware/contentSecurityPolicy");
const uploadErrorHandler = require("./middleware/uploadErrorHandler");
const errorHandler = require("./middleware/errorHandler");
const notFoundHandler = require("./middleware/notFoundHandler");
const { ensureUploadDirs, uploadsPath } = require("./startup/ensureUploadDirs");

const attachmentRoutes = require("./routes/attachmentRoutes");
const authRoutes = require("./routes/authRoutes");
const callRoutes = require("./routes/callRoutes");
const dialogRoutes = require("./routes/dialogRoutes");
const e2eeRoutes = require("./routes/e2eeRoutes");
const groupMessageRoutes = require("./routes/groupMessageRoutes");
const groupRoutes = require("./routes/groupRoutes");
const healthRoutes = require("./routes/healthRoutes");
const profileRoutes = require("./routes/profileRoutes");
const proxyRoutes = require("./routes/proxyRoutes");
const userRoutes = require("./routes/userRoutes");
const voiceRoutes = require("./routes/voiceRoutes");
const setupSocket = require("./sockets/socket");

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);

const server = http.createServer(app);
const io = new Server(server, {
  cors: corsOptions,
  maxHttpBufferSize: Number(process.env.SOCKET_MAX_HTTP_BUFFER_SIZE) || 1024 * 1024,
  pingTimeout: Number(process.env.SOCKET_PING_TIMEOUT_MS) || 20000,
  pingInterval: Number(process.env.SOCKET_PING_INTERVAL_MS) || 25000
});

app.set("io", io);

app.use(
  helmet({
    contentSecurityPolicy,
    crossOriginResourcePolicy: {
      policy: "cross-origin"
    },
    referrerPolicy: {
      policy: "no-referrer"
    },
    frameguard: {
      action: "deny"
    },
    hsts: env.NODE_ENV === "production"
      ? {
          maxAge: 15552000,
          includeSubDomains: true,
          preload: false
        }
      : false
  })
);

app.use(requestContext);
app.use(cors(corsOptions));
app.use(securityHeaders);
app.use(express.json({ limit: "256kb" }));
app.use(stateChangingRequestGuard);
app.use(mongoSanitize);
app.use(hpp());
app.use(apiLimiter);

ensureUploadDirs();

app.use(
  "/uploads",
  express.static(
    uploadsPath,
    {
      fallthrough: false,
      immutable: true,
      maxAge: "7d",
      setHeaders(res, filePath) {
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Cross-Origin-Resource-Policy", "same-site");

        if (filePath.includes(`${path.sep}attachments${path.sep}`)) {
          res.setHeader("Content-Disposition", "attachment");
        }
      }
    }
  )
);

app.use(healthRoutes);
app.use(authRoutes);
app.use(profileRoutes);
app.use(userRoutes);
app.use(dialogRoutes);
app.use(groupRoutes);
app.use(attachmentRoutes);
app.use(groupMessageRoutes);
app.use(e2eeRoutes);
app.use(callRoutes);
app.use(voiceRoutes);
app.use(proxyRoutes);

app.use(notFoundHandler);
app.use(uploadErrorHandler);
app.use(errorHandler);

setupSocket(io);

module.exports = {
  app,
  server,
  io
};
