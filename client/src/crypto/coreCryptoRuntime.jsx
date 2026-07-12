import { initWasmModule } from "@wireapp/core-crypto/browser";
import { CORE_CRYPTO_WASM_URL } from "./mls/constants";

let runtimePromise = null;
let runtimeReady = false;

/**
 * wasm-bindgen guards only completed initialization. Two overlapping calls can
 * instantiate separate WASM modules and invalidate UniFFI objects created by
 * the first instance. This application-level promise is therefore permanent
 * after success and shared by every CoreCrypto consumer.
 */
export function initializeCoreCryptoRuntime() {
  if (!runtimePromise) {
    runtimePromise = Promise.resolve()
      .then(() => initWasmModule(CORE_CRYPTO_WASM_URL))
      .then(() => {
        runtimeReady = true;
        return true;
      })
      .catch(error => {
        runtimePromise = null;
        runtimeReady = false;
        throw error;
      });
  }
  return runtimePromise;
}

export function getCoreCryptoRuntimeState() {
  return Object.freeze({ ready: runtimeReady, initializing: Boolean(runtimePromise && !runtimeReady) });
}
