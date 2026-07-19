import { useEffect, useState } from "react";

function readTimeFormat() {
  return localStorage.getItem("liotan_time_format") === "12" ? "12" : "24";
}

export default function useTimeFormat() {
  const [timeFormat, setTimeFormat] = useState(readTimeFormat);

  useEffect(() => {
    function handlePreference(event) {
      if (event.detail?.key === "timeFormat") setTimeFormat(event.detail.value);
    }

    window.addEventListener("liotan:ui-preference", handlePreference);
    return () => window.removeEventListener("liotan:ui-preference", handlePreference);
  }, []);

  return timeFormat;
}
