export function devWarn(...args) {
  if (import.meta.env.DEV) {
    console.warn(...args);
  }
}

export function devError(...args) {
  if (import.meta.env.DEV) {
    console.error(...args);
  }
}
