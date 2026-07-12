import { devError } from "../../utils/devLogger";

export class MlsStorageError extends Error {
  constructor(message, {
    code = "mls-storage-unavailable",
    stage = "unknown",
    registeredDevice = false,
    automaticRepairAttempted = false,
    cause
  } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "MlsStorageError";
    this.code = code;
    this.stage = stage;
    this.registeredDevice = Boolean(registeredDevice);
    this.automaticRepairAttempted = Boolean(automaticRepairAttempted);
    this.reprovisionRequired = this.registeredDevice;
  }
}

export function reportCryptoDiagnostic(error, context = {}) {
  if (!import.meta.env.DEV) return;
  // Never attach keys, IndexedDB contents or request bodies to diagnostics.
  devError("[Liotan crypto diagnostic]", {
    name: String(error?.name || "Error"),
    message: String(error?.message || "Unknown crypto error"),
    code: String(error?.code || ""),
    stage: String(error?.stage || context.stage || "unknown"),
    stack: String(error?.stack || "")
  });
}
