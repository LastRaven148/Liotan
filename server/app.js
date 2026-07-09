const express = require("express");
const http = require("http");
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
const { createProductionHostGuard } = require("./middleware/productionHostGuard");
const { stateChangingRequestGuard } = require("./middleware/stateChangingRequestGuard");
const contentSecurityPolicy = require("./middleware/contentSecurityPolicy");
const uploadErrorHandler = require("./middleware/uploadErrorHandler");
const errorHandler = require("./middleware/errorHandler");
const notFoundHandler = require("./middleware/notFoundHandler");

const attachmentRoutes = require("./routes/attachmentRoutes");
const authRoutes = require("./routes/authRoutes");
const callRoutes = require("./routes/callRoutes");
const dialogRoutes = require("./routes/dialogRoutes");
const e2eeRoutes = require("./routes/e2eeRoutes");
const groupMessageRoutes = require("./routes/groupMessageRoutes");
const groupRoutes = require("./routes/groupRoutes");
const healthRoutes = require("./routes/healthRoutes");
const securityRoutes = require("./routes/securityRoutes");
const profileRoutes = require("./routes/profileRoutes");
const userRoutes = require("./routes/userRoutes");
const voiceRoutes = require("./routes/voiceRoutes");
const setupSocket = require("./sockets/socket");

const app = express(); // nosemgrep: express-check-csurf-middleware-usage - stateChangingRequestGuard enforces x-liotan-csrf for unsafe methods.

app.disable("x-powered-by");
app.set("trust proxy", 1);

const server = http.createServer(app); // nosemgrep: using-http-server - TLS terminates at Cloudflare/Render/Nginx, Node listens behind the trusted proxy.
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
app.use(createProductionHostGuard({ nodeEnv: env.NODE_ENV }));
app.use(cors(corsOptions));
app.use(securityHeaders);
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: false, limit: "16kb" }));
app.use(apiLimiter);
app.use(stateChangingRequestGuard);
app.use(mongoSanitize);
app.use(hpp());


app.use(healthRoutes);
app.use(securityRoutes);
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

app.use(notFoundHandler);
app.use(uploadErrorHandler);
app.use(errorHandler);

setupSocket(io);

module.exports = {
  app,
  server,
  io
};
