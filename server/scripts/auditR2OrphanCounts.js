"use strict";

const path = require("node:path");
const mongoose = require("mongoose");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const AttachmentUpload = require("../models/AttachmentUpload");
const Messages = require("../models/Messages");
const AvatarObject = require("../models/AvatarObject");
const User = require("../models/User");
const { listR2Objects } = require("../utils/uploadToR2");

const MAX_OBJECTS = Math.max(
  1,
  Math.min(Number(process.env.LIOTAN_R2_AUDIT_MAX_OBJECTS) || 100_000, 1_000_000)
);

function normalized(value) {
  return String(value || "").trim().replace(/^\/+/, "");
}

function assertInvocation() {
  if (process.env.NODE_ENV === "production" &&
      !process.argv.includes("--production-read-only")) {
    throw new Error("Production R2 inventory requires --production-read-only");
  }
}

async function referencedMediaKeys() {
  const [uploads, messages] = await Promise.all([
    AttachmentUpload.distinct("storageKey", {
      storageKey: { $type: "string", $ne: "" }
    }),
    Messages.distinct("attachment.storageKey", {
      "attachment.storageKey": { $type: "string", $ne: "" }
    })
  ]);
  return new Set([...uploads, ...messages].map(normalized).filter(Boolean));
}

async function referencedAvatarKeys() {
  const [objects, users] = await Promise.all([
    AvatarObject.distinct("storageKey", {
      storageKey: { $type: "string", $ne: "" }
    }),
    User.distinct("avatarStorageKey", {
      avatarStorageKey: { $type: "string", $ne: "" }
    })
  ]);
  return new Set([...objects, ...users].map(normalized).filter(Boolean));
}

async function countBucket(storageClass, referenced) {
  let continuationToken = "";
  let scanned = 0;
  let detached = 0;
  let truncated = false;
  do {
    const remaining = MAX_OBJECTS - scanned;
    if (remaining <= 0) {
      truncated = true;
      break;
    }
    const page = await listR2Objects({
      continuationToken,
      maxKeys: Math.min(1000, remaining),
      storageClass
    });
    for (const key of page.keys) {
      scanned += 1;
      if (!referenced.has(normalized(key))) detached += 1;
    }
    continuationToken = page.nextContinuationToken;
    truncated = page.isTruncated;
    if (!page.isTruncated) break;
  } while (continuationToken);
  return {
    scanned,
    referencedInDatabase: referenced.size,
    detached,
    truncatedByLimit: truncated
  };
}

async function main() {
  assertInvocation();
  await mongoose.connect(process.env.MONGO_URI, {
    maxPoolSize: 2,
    serverSelectionTimeoutMS: 10_000
  });
  try {
    const [mediaReferences, avatarReferences] = await Promise.all([
      referencedMediaKeys(),
      referencedAvatarKeys()
    ]);
    const [privateMedia, publicAvatars] = await Promise.all([
      countBucket("private-media", mediaReferences),
      countBucket("public-avatar", avatarReferences)
    ]);
    process.stdout.write(`${JSON.stringify({
      schema: "liotan-r2-orphan-counts/v1",
      mode: "read-only",
      mutatesProduction: false,
      containsRawObjectKeys: false,
      maxObjectsPerBucket: MAX_OBJECTS,
      privateMedia,
      publicAvatars
    }, null, 2)}\n`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(error => {
  process.stderr.write(`${JSON.stringify({
    ok: false,
    error: {
      name: String(error?.name || "Error").slice(0, 80),
      code: String(error?.code || "R2_AUDIT_FAILED").slice(0, 80)
    }
  })}\n`);
  process.exitCode = 1;
});
