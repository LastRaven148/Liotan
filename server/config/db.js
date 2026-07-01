const mongoose =
  require("mongoose");

const logger =
  require("../utils/logger");

async function connectDb() {
  await mongoose.connect(
    process.env.MONGO_URI
  );

  logger.info("MONGO CONNECTED");
}

module.exports = connectDb;
