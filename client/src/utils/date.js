export function formatTime(
  date
) {

  return new Date(
    date
  ).toLocaleTimeString(
    [],
    {
      hour: "2-digit",
      minute: "2-digit"
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