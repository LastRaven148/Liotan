require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env")
});

const connectDb = require("../config/db");
const Message = require("../models/Messages");
const AttachmentUpload = require("../models/AttachmentUpload");
const { listR2Objects, deleteFromR2 } = require("../utils/uploadToR2");

const CONFIRM_VALUE = "YES_DELETE_DETACHED_R2_MEDIA";
const SAFE_PREFIXES = [
  "files/",
  "photos/",
  "videos/",
  "audio/",
  "liotan/mls/",
  "liotan/u/",
  "liotan/uploads/"
];

function normalizeKey(value) {
  return String(value || "").trim().replace(/^\/+/, "");
}

async function listAllKeys(prefix, maxObjects) {
  let continuationToken = "";
  const keys = [];

  do {
    const page = await listR2Objects({ prefix, continuationToken });
    keys.push(...page.keys.map(normalizeKey).filter(Boolean));
    continuationToken = page.nextContinuationToken;
    if (!page.isTruncated || keys.length >= maxObjects) break;
  } while (continuationToken);

  return keys.slice(0, maxObjects);
}

async function collectReferencedKeys() {
  const referenced = new Set();

  const messages = await Message.find(
    { "attachment.storageKey": { $type: "string", $ne: "" } },
    "attachment.storageKey"
  ).lean();

  for (const message of messages) {
    const key = normalizeKey(message.attachment?.storageKey);
    if (key) referenced.add(key);
  }

  const uploads = await AttachmentUpload.find(
    { storageKey: { $type: "string", $ne: "" } },
    "storageKey"
  ).lean();

  for (const upload of uploads) {
    const key = normalizeKey(upload.storageKey);
    if (key) referenced.add(key);
  }

  return referenced;
}

async function main() {
  const confirmed = process.env.LIOTAN_R2_DETACHED_DELETE_CONFIRM === CONFIRM_VALUE || process.argv.includes("--yes");
  const maxObjectsArg = process.argv.find(arg => arg.startsWith("--max="));
  const maxObjects = maxObjectsArg ? Number(maxObjectsArg.split("=")[1]) : Number(process.env.LIOTAN_R2_DETACHED_MAX_OBJECTS || 10000);

  await connectDb();

  const referenced = await collectReferencedKeys();
  const allKeys = [];

  for (const prefix of SAFE_PREFIXES) {
    allKeys.push(...(await listAllKeys(prefix, maxObjects)));
  }

  const uniqueKeys = [...new Set(allKeys)];
  const detachedKeys = uniqueKeys.filter(key => !referenced.has(key));
  const limitedKeys = detachedKeys.slice(0, maxObjects);

  if (confirmed) {
    for (const key of limitedKeys) {
      await deleteFromR2(key);
    }
  }

  console.log(JSON.stringify({
    ok: true,
    mode: confirmed ? "delete" : "dry-run",
    safePrefixes: SAFE_PREFIXES,
    scanned: uniqueKeys.length,
    referenced: referenced.size,
    foundDetached: detachedKeys.length,
    processed: confirmed ? limitedKeys.length : 0,
    truncatedByLimit: detachedKeys.length > limitedKeys.length,
    sampleKeys: limitedKeys.slice(0, 50),
    nextStep: confirmed
      ? "Deletion attempted. Re-run without --yes to verify foundDetached is 0."
      : `Dry run only. To delete detached test media: LIOTAN_R2_DETACHED_DELETE_CONFIRM=${CONFIRM_VALUE} npm run cleanup:r2-detached -- --yes`
  }, null, 2));

  process.exit(0);
}

main().catch(err => {
  console.error(JSON.stringify({
    ok: false,
    error: err.message
  }, null, 2));
  process.exit(1);
});
