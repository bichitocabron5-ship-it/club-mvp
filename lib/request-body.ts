export class RequestBodyTooLargeError extends Error {
  constructor() {
    super("REQUEST_BODY_TOO_LARGE");
  }
}

export class InvalidJsonBodyError extends Error {
  constructor() {
    super("INVALID_JSON_BODY");
  }
}

export async function readJsonBodyWithLimit(req: Request, maxBytes: number) {
  const contentLength = req.headers.get("content-length");

  if (contentLength) {
    const parsedLength = Number(contentLength);

    if (Number.isFinite(parsedLength) && parsedLength > maxBytes) {
      throw new RequestBodyTooLargeError();
    }
  }

  const text = await req.text();

  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    throw new RequestBodyTooLargeError();
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new InvalidJsonBodyError();
  }
}
