import { Database, DatabaseKey } from "@wireapp/core-crypto/browser";

const DATABASE_PREFIX = "liotan-mls-";
const DATABASE_NAME_PATTERN = /^liotan-mls-[0-9a-f-]{36}-[0-9a-f]{16}$/i;

export function getCoreCryptoDatabaseName(cryptoUserId, deviceId) {
  const name = `${DATABASE_PREFIX}${String(cryptoUserId || "").toLowerCase()}-${String(deviceId || "").toLowerCase()}`;
  if (!DATABASE_NAME_PATTERN.test(name)) throw new TypeError("Invalid CoreCrypto database identity");
  return name;
}

export async function openCoreCryptoDatabase({ cryptoUserId, deviceId, databaseKey }) {
  const name = getCoreCryptoDatabaseName(cryptoUserId, deviceId);
  const key = new DatabaseKey(databaseKey);
  try {
    return { name, database: await Database.open(name, key) };
  } finally {
    key.uniffiDestroy();
  }
}

export function deleteCoreCryptoDatabase(name) {
  if (!DATABASE_NAME_PATTERN.test(String(name || ""))) {
    return Promise.reject(new TypeError("Refusing to delete an unexpected IndexedDB database"));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error || new Error("Unable to delete the invalid CoreCrypto database"));
    request.onblocked = () => reject(new Error("CoreCrypto database deletion is blocked by another tab"));
  });
}

export const AUTOMATIC_REPAIR_STAGES = Object.freeze(new Set([
  "database-open",
  "core-create",
  "mls-init",
  "credential-load"
]));

export function shouldAutomaticallyRepairDatabase(stage, registeredDevice) {
  return AUTOMATIC_REPAIR_STAGES.has(stage) && !registeredDevice;
}
