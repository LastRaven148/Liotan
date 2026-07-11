import {
  useCallback,
  useEffect,
  useState
} from "react";

import {
  getOfflineBlob,
  saveOfflineBlob
} from "./messageStorage";

export function getMediaKey(attachment) {
  return (
    attachment?.mediaId ||
    attachment?.uploadId ||
    attachment?.url ||
    ""
  );
}

export default function useOfflineMedia({
  attachment,
  remoteUrl,
  shouldAutoCache,
  decryptBlob,
  downloadBlob
}) {
  const [localUrl, setLocalUrl] =
    useState("");

  const [savingOffline, setSavingOffline] =
    useState(false);

  const [isOfflineSaved, setIsOfflineSaved] =
    useState(false);

  const mediaKey =
    getMediaKey(attachment);

  useEffect(() => {
    let alive = true;
    let objectUrl = "";

    async function loadOffline() {
      if (!mediaKey) {
        return;
      }

      try {
        const storedBlob =
          await getOfflineBlob(mediaKey);

        if (!storedBlob || !alive) {
          return;
        }

        const displayBlob = decryptBlob
          ? await decryptBlob(storedBlob)
          : storedBlob;

        if (!alive) {
          return;
        }

        objectUrl =
          URL.createObjectURL(displayBlob);

        setLocalUrl(objectUrl);
        setIsOfflineSaved(true);
      } catch (err) {
        if (import.meta.env.DEV) console.warn(err);
      }
    }

    loadOffline();

    return () => {
      alive = false;

      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [
    mediaKey,
    decryptBlob
  ]);

  const saveOffline = useCallback(async (
    options = {}
  ) => {
    if (
      (!remoteUrl && !downloadBlob) ||
      !mediaKey ||
      savingOffline
    ) {
      return;
    }

    try {
      setSavingOffline(true);

      const remoteBlob = downloadBlob
        ? await downloadBlob()
        : await fetch(remoteUrl, { credentials: "include" }).then(response => {
            if (!response.ok) throw new Error("Media request failed");
            return response.blob();
          });

      const displayBlob = decryptBlob
        ? await decryptBlob(remoteBlob)
        : remoteBlob;

      // Encrypted media is stored offline only as ciphertext.
      // The decrypted blob exists only as an in-memory object URL for the current session.
      await saveOfflineBlob(
        mediaKey,
        remoteBlob
      );

      const objectUrl =
        URL.createObjectURL(displayBlob);

      setLocalUrl(objectUrl);
      setIsOfflineSaved(true);
    } catch (err) {
      if (!options.silent) {
        if (import.meta.env.DEV) console.warn(err);
      }
    } finally {
      setSavingOffline(false);
    }
  }, [
    remoteUrl,
    mediaKey,
    savingOffline,
    decryptBlob,
    downloadBlob
  ]);

  useEffect(() => {
    if (
      !shouldAutoCache ||
      isOfflineSaved ||
      savingOffline
    ) {
      return;
    }

    saveOffline({
      silent: true
    });
  }, [
    shouldAutoCache,
    isOfflineSaved,
    savingOffline,
    saveOffline
  ]);

  return {
    localUrl,
    savingOffline,
    isOfflineSaved,
    saveOffline
  };
}
