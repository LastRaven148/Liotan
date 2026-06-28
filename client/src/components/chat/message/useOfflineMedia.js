import {
  useEffect,
  useState
} from "react";

import {
  getOfflineBlob,
  saveOfflineBlob
} from "./messageStorage";

export function getMediaKey(attachment) {
  return (
    attachment?.publicId ||
    attachment?.url ||
    ""
  );
}

export default function useOfflineMedia({
  attachment,
  remoteUrl,
  shouldAutoCache
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
        console.error(err);
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

  async function saveOffline(
    options = {}
  ) {
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

      const blob =
        await response.blob();

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
        console.error(err);
      }
    } finally {
      setSavingOffline(false);
    }
  }

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
    savingOffline
  ]);

  return {
    localUrl,
    savingOffline,
    isOfflineSaved,
    saveOffline
  };
}