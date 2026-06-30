import {
  useEffect,
  useState
} from "react";

const MOBILE_QUERY = "(max-width: 768px)";

function getViewportMode() {
  if (typeof window === "undefined") {
    return "desktop";
  }

  return window.matchMedia(MOBILE_QUERY).matches
    ? "mobile"
    : "desktop";
}

export default function useViewportMode() {
  const [viewportMode, setViewportMode] = useState(getViewportMode);

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_QUERY);

    function handleChange() {
      setViewportMode(mediaQuery.matches ? "mobile" : "desktop");
    }

    handleChange();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  return viewportMode;
}
