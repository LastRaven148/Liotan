import {
  useEffect,
  useRef
} from "react";

export default function useAppInitialization({
  token,
  username,
  loadDialogs,
  loadProfile,
  loadPinnedChats,
  loadArchivedChats
}) {

  const bootKeyRef =
    useRef("");

  const bootingRef =
    useRef(false);

  const failedAtRef =
    useRef(0);

  useEffect(() => {

    if (!token || !username) {
      bootKeyRef.current = "";
      bootingRef.current = false;
      return;
    }

    const bootKey =
      `${username}:${token.slice(0, 16)}`;

    if (
      bootKeyRef.current === bootKey ||
      bootingRef.current
    ) {
      return;
    }

    const now =
      Date.now();

    if (
      failedAtRef.current &&
      now - failedAtRef.current < 5000
    ) {
      return;
    }

    let cancelled =
      false;

    bootingRef.current =
      true;

    const tasks = [
      loadDialogs?.(),
      loadProfile?.(username),
      loadPinnedChats?.(),
      loadArchivedChats?.()
    ].filter(Boolean);

    Promise.allSettled(tasks)
      .then(results => {
        if (cancelled) {
          return;
        }

        const hasRejected =
          results.some(
            result => result.status === "rejected"
          );

        if (hasRejected) {
          failedAtRef.current =
            Date.now();
          return;
        }

        bootKeyRef.current =
          bootKey;
      })
      .finally(() => {
        if (!cancelled) {
          bootingRef.current =
            false;
        }
      });

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
