require("dotenv").config();

const { deleteR2Prefix } = require("../utils/uploadToR2");

const DEFAULT_SAFE_PREFIX = "liotan/u/";
const CONFIRM_VALUE = "YES_DELETE_R2_PREFIX";

async function main() {
  const prefix = String(process.env.LIOTAN_R2_DELETE_PREFIX || process.argv[2] || DEFAULT_SAFE_PREFIX).trim();
  const confirmed = process.env.LIOTAN_R2_DELETE_CONFIRM === CONFIRM_VALUE || process.argv.includes("--yes");
  const maxObjectsArg = process.argv.find(arg => arg.startsWith("--max="));
  const maxObjects = maxObjectsArg ? Number(maxObjectsArg.split("=")[1]) : Number(process.env.LIOTAN_R2_DELETE_MAX_OBJECTS || 10000);

  if (!prefix || prefix === "/") {
    throw new Error("Empty R2 prefix is forbidden");
  }

  if (!prefix.startsWith("liotan/")) {
    throw new Error(`Unsafe prefix: ${prefix}. Prefix must start with liotan/`);
  }

  if (prefix === "liotan/avatars" || prefix === "liotan/avatars/") {
    throw new Error("Refusing to delete avatar prefix from this script");
  }

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
