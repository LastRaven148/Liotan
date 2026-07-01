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
    attachment?.url ||
    ""
  );
}

export default function useOfflineMedia({
  attachment,
  remoteUrl,
  shouldAutoCache,
  decryptBlob
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
        const blob =
          await getOfflineBlob(mediaKey);

        if (!blob || !alive) {
          return;
        }

        objectUrl =
          URL.createObjectURL(blob);

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
    mediaKey
  ]);

  const saveOffline = useCallback(async (
    options = {}
  ) => {
    if (
      !remoteUrl ||
      !mediaKey ||
      savingOffline
    ) {
      return;
    }

    try {
      setSavingOffline(true);

      const response =
        await fetch(remoteUrl);

      const remoteBlob =
        await response.blob();

      const blob = decryptBlob
        ? await decryptBlob(remoteBlob)
        : remoteBlob;

      await saveOfflineBlob(
        mediaKey,
        blob
      );

      const objectUrl =
        URL.createObjectURL(blob);

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
    decryptBlob
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