const path =
  require("path");

const fs =
  require("fs/promises");

const User =
  require("../models/User");

const Message =
  require("../models/Messages");

const Group =
  require("../models/Group");

const uploadsDir =
  path.resolve(
    __dirname,
    "..",
    "uploads"
  );

function urlToPath(fileUrl) {

  if (
    !fileUrl ||
    !fileUrl.startsWith("/uploads/")
  ) {
    return null;
  }

  const relative =
    fileUrl.replace(
      "/uploads/",
      ""
    );

  const filePath =
    path.resolve(
      uploadsDir,
      relative
    );

  if (
    !filePath.startsWith(
      uploadsDir + path.sep
    )
  ) {
    return null;
  }

  return filePath;

}

async function walk(dir) {

  const result = [];

  try {

    const entries =
      await fs.readdir(
        dir,
        {
          withFileTypes: true
        }
      );

    for (const entry of entries) {

      const fullPath =
        path.join(
          dir,
          entry.name
        );

      if (entry.isDirectory()) {
        result.push(
          ...(await walk(fullPath))
        );
      } else {
        result.push(fullPath);
      }

    }

  } catch (err) {

    if (err.code !== "ENOENT") {
      throw err;
    }

  }

  return result;

}

async function cleanupUploads() {

  const usedFiles =
    new Set();

  const users =
    await User.find(
      {},
      "avatar"
    );

  for (const user of users) {
    const filePath =
      urlToPath(user.avatar);

    if (filePath) {
      usedFiles.add(filePath);
    }
  }

  const messages =
    await Message.find(
      {},
      "attachment.url"
    );

  for (const message of messages) {
    const filePath =
      urlToPath(
        message.attachment?.url
      );

    if (filePath) {
      usedFiles.add(filePath);
    }
  }

  const groups =
    await Group.find(
      {},
      "avatar"
    );

  for (const group of groups) {
    const filePath =
      urlToPath(group.avatar);

    if (filePath) {
      usedFiles.add(filePath);
    }
  }

  const allFiles =
    await walk(uploadsDir);

  let deleted = 0;

  for (const filePath of allFiles) {

    if (usedFiles.has(filePath)) {
      continue;
    }

    await fs.unlink(filePath);
    deleted += 1;

    console.log(
      "Deleted:",
      filePath
    );

  }

  console.log(
    `Cleanup finished. Deleted files: ${deleted}`
  );

  return {
    ok: true,
    deleted
  };

}

module.exports =
  cleanupUploads;