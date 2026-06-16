export async function apiRequest(
  url,
  options = {}
) {

  const token =
    localStorage.getItem(
      "token"
    );

  const headers = {
    ...(options.headers || {})
  };

  if (
    token &&
    !headers.Authorization
  ) {
    headers.Authorization =
      `Bearer ${token}`;
  }

  const res =
    await fetch(url, {
      ...options,
      headers
    });

  const contentType =
    res.headers.get(
      "content-type"
    ) || "";

  let data = null;

  if (
    contentType.includes(
      "application/json"
    )
  ) {
    data =
      await res.json();
  } else {
    const text =
      await res.text();

    data = {
      error:
        text || "Request failed"
    };
  }

  if (!res.ok) {
    throw new Error(
      data?.error ||
      "Request failed"
    );
  }

  return data;

}