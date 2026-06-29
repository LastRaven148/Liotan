require("dotenv").config({
  path: require("path").join(
    __dirname,
    ".env"
  )
});

const helmet =
  require("helmet");

const {
  strictIpLimiter,
  apiLimiter
} = require("./middleware/rateLimiters");

const hpp =
  require("hpp");

const mongoSanitize =
  require("./middleware/mongoSanitize");

const express =
  require("express");

const http =
  require("http");

const cors =
  require("cors");

const path =
  require("path");

const fs =
  require("fs");

const { Server } =
  require("socket.io");

const connectDb =
  require("./config/db");

const authRoutes =
  require("./routes/authRoutes");

const profileRoutes =
  require("./routes/profileRoutes");

const userRoutes =
  require("./routes/userRoutes");

const dialogRoutes =
  require("./routes/dialogRoutes");

const groupRoutes =
  require("./routes/groupRoutes");

const groupMessageRoutes =
  require("./routes/groupMessageRoutes");

const e2eeRoutes =
  require("./routes/e2eeRoutes");

const callRoutes =
  require("./routes/callRoutes");

const voiceRoutes =
  require("./routes/voiceRoutes");

const proxyRoutes =
  require("./routes/proxyRoutes");

const User =
  require("./models/User");

const deleteAccountData =
  require("./utils/deleteAccountData");

const setupSocket =
  require("./sockets/socket");

const errorHandler =
  require("./middleware/errorHandler");

const uploadErrorHandler =
  require("./middleware/uploadErrorHandler");

const securityHeaders =
  require("./middleware/securityHeaders");

const logger =
  require("./utils/logger");

const attachmentRoutes =
  require("./routes/attachmentRoutes");

const {
  getMailStatus
} = require("./utils/mailer");

if (!process.env.JWT_SECRET) {
  throw new Error(
    "JWT_SECRET is missing"
  );
}

if (!process.env.MONGO_URI) {
  throw new Error(
    "MONGO_URI is missing"
  );
}

const PORT =
  process.env.PORT || 3001;

const allowedOrigins = [
  "http://localhost:3000",
  "https://liotan.onrender.com",
  "https://liotan-api.onrender.com",
  process.env.CLIENT_URL
].filter(Boolean);

function corsOrigin(
  origin,
  callback
) {

  if (!origin) {
    return callback(
      null,
      true
    );
  }

  if (
    allowedOrigins.includes(origin)
  ) {
    return callback(
      null,
      true
    );
  }

  return callback(
    new Error(
      `CORS blocked: ${origin}`
    )
  );

}

const corsOptions = {
  origin: corsOrigin,
  credentials: true,
  methods: [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS"
  ],
  allowedHeaders: [
    "Content-Type",
    "Authorization"
  ]
};

const app =
  express();

app.disable(
  "x-powered-by"
);

app.set(
  "trust proxy",
  1
);

const server =
  http.createServer(app);

const io =
  new Server(server, {
    cors: corsOptions
  });

app.set(
  "io",
  io
);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: {
      policy: "cross-origin"
    }
  })
);

app.use(
  cors(corsOptions)
);

app.use(
  securityHeaders
);

app.use(
  strictIpLimiter
);

app.use(
  express.json({
    limit: "256kb"
  })
);

app.use(
  mongoSanitize
);

app.use(
  hpp()
);

app.use(
  apiLimiter
);

app.get(
  "/health",
  (req, res) => {
    res.json({
      ok: true,
      app: "Liotan"
    });
  }
);

const uploadsPath =
  path.join(
    __dirname,
    "uploads"
  );

const avatarsPath =
  path.join(
    uploadsPath,
    "avatars"
  );

if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(
    uploadsPath
  );
}

if (!fs.existsSync(avatarsPath)) {
  fs.mkdirSync(
    avatarsPath,
    {
      recursive: true
    }
  );
}

app.use(
  "/uploads",
  express.static(
    uploadsPath,
    {
      fallthrough: false,
      immutable: true,
      maxAge: "7d",
      setHeaders(res) {
        res.setHeader(
          "X-Content-Type-Options",
          "nosniff"
        );
      }
    }
  )
);

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

app.use(uploadErrorHandler);
app.use(errorHandler);

setupSocket(io);

async function cleanupLegacyAccountsOnStartup() {
  if (String(process.env.LIOTAN_KEEP_LEGACY_ACCOUNTS || "false") === "true") {
    return;
  }

  const legacyUsers =
    await User.find({
      $or: [
        { emailHash: { $exists: false } },
        { emailHash: null },
        { emailVerified: { $ne: true } }
      ]
    }, "username").lean();

  for (const user of legacyUsers) {
    await deleteAccountData(user.username);
  }

  if (legacyUsers.length) {
    logger.warn(
      "Deleted legacy accounts without verified email",
      { count: legacyUsers.length }
    );
  }
}

async function start() {

  try {

    await connectDb();

    await cleanupLegacyAccountsOnStartup();

    server.listen(
      PORT,
      () => {
        logger.info(
          "SERVER READY",
          { port: PORT }
        );

        logger.info(
          "ALLOWED ORIGINS",
          { allowedOrigins }
        );

        const mailStatus =
          getMailStatus();

        logger.info(
          "MAIL PROVIDER",
          mailStatus
        );
      }
    );

  } catch (err) {

    logger.error(
      "SERVER START ERROR",
      err
    );

  }

}

start();