export function formatTime(
  date,
  timeFormat = localStorage.getItem("liotan_time_format") === "12" ? "12" : "24"
) {

  return new Date(
    date
  ).toLocaleTimeString(
    [],
    {
      hour: "2-digit",
      minute: "2-digit",
      hour12: timeFormat === "12"
    }
  );
}

export function formatDate(
  date
) {

  return new Date(
    date
  ).toLocaleDateString();
}
