type ErrorPayload = {
  error?: string;
};

export async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const responseText = await response.text();
  const trimmedResponse = responseText.trim();
  let data: T | ErrorPayload | null = null;

  try {
    data = trimmedResponse ? (JSON.parse(trimmedResponse) as T | ErrorPayload) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message =
      data &&
      typeof data === "object" &&
      "error" in data &&
      typeof data.error === "string"
        ? data.error
        : trimmedResponse && !trimmedResponse.startsWith("<")
          ? trimmedResponse
          : `HTTP ${response.status} ${response.statusText}`.trim();

    throw new Error(message);
  }

  if (!trimmedResponse) {
    throw new Error(`Respuesta vacía del servidor (${response.status})`);
  }

  if (data === null) {
    throw new Error(`Respuesta JSON inválida del servidor (${response.status})`);
  }

  return data as T;
}
