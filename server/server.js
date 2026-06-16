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

const CLIENT_URL =
  process.env.CLIENT_URL ||
  "http://localhost:3000";

const PORT =
  process.env.PORT || 3001;

const app =
  express();

app.set(
  "trust proxy",
  1
);

const server =
  http.createServer(app);

const io =
  new Server(server, {
    cors: {
      origin: [
        CLIENT_URL
      ],
      credentials: true
    }
  });

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: "cross-origin"
    }
  })
);

app.use(
  cors({
    origin: [
      CLIENT_URL
    ],
    credentials: true
  })
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

app.use(
  apiLimiter
);

if (
  !fs.existsSync(
    path.join(
      __dirname,
      "uploads"
    )
  )
) {
  fs.mkdirSync(
    path.join(
      __dirname,
      "uploads"
    )
  );
}

if (
  !fs.existsSync(
    path.join(
      __dirname,
      "uploads",
      "avatars"
    )
  )
) {
  fs.mkdirSync(
    path.join(
      __dirname,
      "uploads",
      "avatars"
    ),
    {
      recursive: true
    }
  );
}

app.use(
  "/uploads",
  express.static(
    path.join(
      __dirname,
      "uploads"
    )
  )
);

app.use(authRoutes);
app.use(profileRoutes);
app.use(userRoutes);
app.use(dialogRoutes);
app.use(attachmentRoutes);

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