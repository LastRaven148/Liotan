export function destroyUniffi(value) {
  if (!value || typeof value.uniffiDestroy !== "function") return;
  try {
    value.uniffiDestroy();
  } catch {
    // UniFFI objects may already have been consumed or destroyed by a failed
    // FFI call. Cleanup must never replace the original crypto error.
  }
}

export function destroyUniffiAll(values) {
  for (const value of values || []) destroyUniffi(value);
}
