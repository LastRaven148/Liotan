import {
  useCallback,
  useEffect,
  useRef,
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

  const objectUrlRef =
    useRef("");

  const replaceObjectUrl =
    useCallback((nextUrl) => {
      const previous = objectUrlRef.current;
      objectUrlRef.current = nextUrl;
      setLocalUrl(nextUrl);
      if (previous && previous !== nextUrl) URL.revokeObjectURL(previous);
    }, []);

  const mediaKey =
    getMediaKey(attachment);

  useEffect(() => {
    let alive = true;
    let objectUrl = "";

    replaceObjectUrl("");
    setIsOfflineSaved(false);

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

        replaceObjectUrl(objectUrl);
        setIsOfflineSaved(true);
      } catch (err) {
        if (import.meta.env.DEV) console.warn(err);
      }
    }

    loadOffline();

    return () => {
      alive = false;

      if (objectUrl && objectUrlRef.current === objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrlRef.current = "";
      }
    };
  }, [
    mediaKey,
    decryptBlob,
    replaceObjectUrl
  ]);

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = "";
  }, []);

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

      replaceObjectUrl(objectUrl);
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
    downloadBlob,
    replaceObjectUrl
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
