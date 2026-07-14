require("dotenv").config();

const { deleteR2Prefix } = require("../utils/uploadToR2");

const DEFAULT_SAFE_PREFIX = "liotan/u/";
const CONFIRM_VALUE = "YES_DELETE_R2_PREFIX";

const SAFE_MEDIA_PREFIXES = new Set([
  "liotan/mls/",
  "liotan/u/",
  "liotan/uploads/",
  "files/",
  "photos/",
  "videos/",
  "audio/"
]);

const FORBIDDEN_PREFIXES = new Set([
  "",
  "/",
  "avatars/",
  "avatar/",
  "liotan/avatars/",
  "liotan/groups/"
]);

function normalizePrefix(value) {
  return String(value || "")
    .trim()
    .replace(/^\/+/, "");
}

function assertSafePrefix(prefix) {
  if (!prefix || prefix.includes("..") || prefix.includes("\\")) {
    throw new Error(`Unsafe prefix: ${prefix || "<empty>"}`);
  }

  const normalized = prefix.endsWith("/") ? prefix : `${prefix}/`;

  if (FORBIDDEN_PREFIXES.has(normalized) || FORBIDDEN_PREFIXES.has(prefix)) {
    throw new Error(`Refusing to delete protected prefix: ${prefix}`);
  }

  if (!SAFE_MEDIA_PREFIXES.has(normalized)) {
    throw new Error(
      `Unsafe prefix: ${prefix}. Allowed media prefixes: ${[...SAFE_MEDIA_PREFIXES].join(", ")}`
    );
  }

  return normalized;
}

async function main() {
  const rawPrefix = process.env.LIOTAN_R2_DELETE_PREFIX || process.argv[2] || DEFAULT_SAFE_PREFIX;
  const prefix = assertSafePrefix(normalizePrefix(rawPrefix));
  const confirmed = process.env.LIOTAN_R2_DELETE_CONFIRM === CONFIRM_VALUE || process.argv.includes("--yes");
  const maxObjectsArg = process.argv.find(arg => arg.startsWith("--max="));
  const maxObjects = maxObjectsArg ? Number(maxObjectsArg.split("=")[1]) : Number(process.env.LIOTAN_R2_DELETE_MAX_OBJECTS || 10000);

  const result = await deleteR2Prefix(prefix, {
    dryRun: !confirmed,
    maxObjects
  });

  console.log(JSON.stringify({
    ok: true,
    mode: confirmed ? "delete" : "dry-run",
    prefix: result.prefix,
    found: result.found,
    processed: result.processed,
    truncatedByLimit: result.truncatedByLimit,
    sampleKeys: result.keys.slice(0, 25),
    nextStep: confirmed
      ? "Deletion attempted. Re-run without --yes to verify that found is 0."
      : `Dry run only. To delete, run: LIOTAN_R2_DELETE_CONFIRM=${CONFIRM_VALUE} npm run cleanup:r2-prefix -- ${prefix} --yes`
  }, null, 2));
}

main().catch(err => {
  console.error(JSON.stringify({
    ok: false,
    error: err.message
  }, null, 2));
  process.exit(1);
});
