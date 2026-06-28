import {
  useEffect,
  useState
} from "react";

export default function useMediaViewer() {
  const [viewerOpen, setViewerOpen] =
    useState(false);

  useEffect(() => {
    if (!viewerOpen) {
      return;
    }

    function handleViewerEsc(e) {
      if (e.key !== "Escape") {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      if (e.stopImmediatePropagation) {
        e.stopImmediatePropagation();
      }

      setViewerOpen(false);
    }

    window.addEventListener(
      "keydown",
      handleViewerEsc,
      true
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleViewerEsc,
        true
      );
    };
  }, [
    viewerOpen
  ]);

  return {
    viewerOpen,
    openViewer: () =>
      setViewerOpen(true),
    closeViewer: () =>
      setViewerOpen(false)
  };
}