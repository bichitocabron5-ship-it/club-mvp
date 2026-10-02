import "server-only";
import { MemberDocumentUploadError, MEMBER_DOCUMENT_REQUEST_MAX_BYTES } from "@/lib/member-document-writer";

// Bound the actual stream as well as Content-Length before parsing multipart.
export async function readMemberDocumentForm(req: Request) {
  if (!/^multipart\/form-data\s*;/i.test(req.headers.get("content-type") ?? "")) {
    throw new MemberDocumentUploadError("MULTIPART_REQUIRED", 415);
  }
  const length = req.headers.get("content-length");
  if (length && Number(length) > MEMBER_DOCUMENT_REQUEST_MAX_BYTES) throw new MemberDocumentUploadError("REQUEST_TOO_LARGE", 413);
  const reader = req.body?.getReader();
  if (!reader) throw new MemberDocumentUploadError("INVALID_FORM");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MEMBER_DOCUMENT_REQUEST_MAX_BYTES) {
        await reader.cancel();
        throw new MemberDocumentUploadError("REQUEST_TOO_LARGE", 413);
      }
      chunks.push(value);
    }
    return await new Response(Buffer.concat(chunks), { headers: { "content-type": req.headers.get("content-type")! } }).formData();
  } catch (error) {
    if (error instanceof MemberDocumentUploadError) throw error;
    throw new MemberDocumentUploadError("INVALID_FORM");
  } finally { reader.releaseLock(); }
}
