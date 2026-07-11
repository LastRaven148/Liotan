const mongoose =
  require("mongoose");

const logger =
  require("../utils/logger");

async function connectDb() {
  await mongoose.connect(
    process.env.MONGO_URI
  );

  if (process.env.NODE_ENV === "production") {
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    if (!hello.setName || !Array.isArray(hello.hosts) || hello.hosts.length < 1) {
      const err = new Error("Production MLS delivery requires a MongoDB replica set for atomic epochs and one-time key packages");
      err.code = "MONGO_TRANSACTIONS_REQUIRED";
      throw err;
    }
  }

  logger.info("MONGO CONNECTED");
}

module.exports = connectDb;
