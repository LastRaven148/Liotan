import {
  useEffect
} from "react";

const bootRegistry =
  new Map();

const BOOT_SUCCESS_TTL_MS =
  5 * 60 * 1000;

const BOOT_ERROR_TTL_MS =
  20 * 1000;

function getBootEntry(key) {
  return bootRegistry.get(key) || null;
}

function setBootEntry(key, value) {
  bootRegistry.set(key, value);
}

export function resetAppBootstrapGuard() {
  bootRegistry.clear();
}

export default function useAppInitialization({
  token,
  username,
  loadDialogs,
  loadProfile,
  loadPinnedChats,
  loadArchivedChats
}) {

  useEffect(() => {

    if (!token || !username) {
      return undefined;
    }

    const bootKey =
      `${username}:${token.slice(0, 24)}`;

    const now =
      Date.now();

    const existing =
      getBootEntry(bootKey);

    if (existing?.status === "running") {
      return undefined;
    }

    if (existing?.until && existing.until > now) {
      return undefined;
    }

    let cancelled =
      false;

    async function boot() {
      setBootEntry(bootKey, {
        status: "running",
        until: Date.now() + BOOT_ERROR_TTL_MS
      });

      try {
        // Sequential bootstrap is intentional: browsers can choke when several
        // authenticated startup requests fail at the same time.
        await loadProfile?.(username);

        if (cancelled) {
          return;
        }

        await loadDialogs?.();

        if (cancelled) {
          return;
        }

        await loadPinnedChats?.();

        if (cancelled) {
          return;
        }

        await loadArchivedChats?.();

        setBootEntry(bootKey, {
          status: "done",
          until: Date.now() + BOOT_SUCCESS_TTL_MS
        });
      } catch {
        setBootEntry(bootKey, {
          status: "failed",
          until: Date.now() + BOOT_ERROR_TTL_MS
        });
      }
    }

    boot();

    return () => {
      cancelled = true;
    };

  }, [
    token,
    username,
    loadDialogs,
    loadProfile,
    loadPinnedChats,
    loadArchivedChats
  ]);

}
