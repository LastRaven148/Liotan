require("dotenv").config({
  path: require("path").join(
    __dirname,
    "..",
    ".env"
  )
});

const connectDb =
  require("../config/db");

const cleanupUploads =
  require("./cleanupUploadsTask");

async function main() {

  await connectDb();

  await cleanupUploads();

  process.exit(0);

}

main().catch(err => {
  console.error(err);
  process.exit(1);
});