import {
  useEffect,
  useRef,
  useState
} from "react";

export default function useMessageMenu({
  isMine
}) {
  const [menuOpen, setMenuOpen] =
    useState(false);

  const [menuPlacement, setMenuPlacement] =
    useState("below");

  const [mobileMenu, setMobileMenu] =
    useState(false);

  const longPressRef =
    useRef(null);

  const touchPointRef =
    useRef(null);

  const menuRef =
    useRef(null);

  const messageRef =
    useRef(null);

  function isMobile() {
    return window.matchMedia(
      "(max-width: 768px)"
    ).matches;
  }

  function getEventPoint(e) {
    if (
      e.clientX !== undefined &&
      e.clientY !== undefined
    ) {
      return {
        x: e.clientX,
        y: e.clientY
      };
    }

    if (touchPointRef.current) {
      return touchPointRef.current;
    }

    const rect =
      messageRef.current?.getBoundingClientRect();

    if (!rect) {
      return {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2
      };
    }

    return {
      x: isMine ? rect.right : rect.left,
      y: rect.top + rect.height / 2
    };
  }

  function calculateMenuPosition(e) {
    const point =
      getEventPoint(e);

    const menuHeight = 270;
    const gap = 8;

    const spaceBelow =
      window.innerHeight - point.y;

    const spaceAbove =
      point.y;

    if (spaceBelow >= menuHeight + gap) {
      setMenuPlacement("below");
    } else if (spaceAbove >= menuHeight + gap) {
      setMenuPlacement("above");
    } else {
      setMenuPlacement(point.y > window.innerHeight / 2 ? "above" : "below");
    }
  }

  function openMenu(e) {
    const isMediaMessage =
      e.target.closest(".message-photo-wrap") ||
      e.target.closest(".message-video-wrap");

    if (
      !isMediaMessage &&
      (
        e.target.closest("a") ||
        e.target.closest("textarea") ||
        e.target.closest("input") ||
        e.target.closest("button") ||
        e.target.closest("video") ||
        e.target.closest("audio")
      )
    ) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    if (isMobile()) {
      setMobileMenu(true);
      return;
    }

    calculateMenuPosition(e);
    setMenuOpen(true);
  }

  function handleContextMenu(e) {
    openMenu(e);
  }

  function handleTouchStart(e) {
    const isMediaMessage =
      e.target.closest(".message-photo-wrap") ||
      e.target.closest(".message-video-wrap");

    if (
      !isMediaMessage &&
      (
        e.target.closest("a") ||
        e.target.closest("textarea") ||
        e.target.closest("input") ||
        e.target.closest("button") ||
        e.target.closest("video") ||
        e.target.closest("audio")
      )
    ) {
      return;
    }

    const touch =
      e.touches?.[0];

    if (touch) {
      touchPointRef.current = {
        x: touch.clientX,
        y: touch.clientY
      };
    }

    longPressRef.current =
      setTimeout(() => {
        openMenu(e);
      }, 420);
  }

  function clearLongPress() {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  }

  function closeMenus() {
    setMenuOpen(false);
    setMobileMenu(false);
  }

  useEffect(() => {
    function handleOutside(e) {
      if (!menuOpen) {
        return;
      }

      if (
        menuRef.current &&
        menuRef.current.contains(e.target)
      ) {
        return;
      }

      if (
        messageRef.current &&
        messageRef.current.contains(e.target)
      ) {
        return;
      }

      setMenuOpen(false);
    }

    function handleEsc(e) {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setMobileMenu(false);
      }
    }

    function closeFloatingMenu() {
      setMenuOpen(false);
    }

    document.addEventListener(
      "mousedown",
      handleOutside
    );

    window.addEventListener(
      "keydown",
      handleEsc
    );

    window.addEventListener(
      "scroll",
      closeFloatingMenu,
      true
    );

    window.addEventListener(
      "resize",
      closeFloatingMenu
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handleOutside
      );

      window.removeEventListener(
        "keydown",
        handleEsc
      );

      window.removeEventListener(
        "scroll",
        closeFloatingMenu,
        true
      );

      window.removeEventListener(
        "resize",
        closeFloatingMenu
      );
    };
  }, [
    menuOpen
  ]);

  return {
    menuOpen,
    menuPlacement,
    mobileMenu,
    menuRef,
    messageRef,
    handleContextMenu,
    handleTouchStart,
    clearLongPress,
    closeMenus
  };
}
