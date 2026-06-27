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

  let res;

  try {
    res =
      await fetch(url, {
        ...options,
        headers
      });
  } catch (err) {
    throw new Error(
      "Нет соединения с сервером или запрос был прерван"
    );
  }

  const contentType =
    res.headers.get(
      "content-type"
    ) || "";

  let data = null;

  try {
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
  } catch {
    data = {
      error: "Не удалось прочитать ответ сервера"
    };
  }

  if (!res.ok) {
    if (res.status === 413) {
      throw new Error(
        "Файл слишком большой для сервера"
      );
    }

    if (res.status === 408) {
      throw new Error(
        "Загрузка заняла слишком много времени"
      );
    }

    if (res.status >= 500) {
      throw new Error(
        data?.error ||
        "Ошибка сервера при загрузке"
      );
    }

    throw new Error(
      data?.error ||
      "Request failed"
    );
  }

  return data;

}