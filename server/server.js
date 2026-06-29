require("dotenv").config({
  path: require("path").join(
    __dirname,
    ".env"
  )
});

const helmet =
  require("helmet");

const {
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

const setupSocket =
  require("./sockets/socket");

const errorHandler =
  require("./middleware/errorHandler");

const uploadErrorHandler =
  require("./middleware/uploadErrorHandler");

const attachmentRoutes =
  require("./routes/attachmentRoutes");

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
    "Authorization",
    "x-dev-admin-key"
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
  express.json({
    limit: "1mb"
  })
);

app.use(
  mongoSanitize
);

app.use(
  hpp()
);

// app.use(
//   apiLimiter
// );

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
    uploadsPath
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

app.use(uploadErrorHandler);
app.use(errorHandler);

setupSocket(io);

async function start() {

  try {

    await connectDb();

    server.listen(
      PORT,
      () => {
        console.log(
          `SERVER READY ${PORT}`
        );

        console.log(
          "ALLOWED ORIGINS:",
          allowedOrigins
        );
      }
    );

  } catch (err) {

    console.error(
      "SERVER START ERROR:",
      err
    );

  }

}

start();