import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";

const source = readFileSync(new URL("../lib/member-document-reader.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const sample = Buffer.from([0, 255, 10, 13, 128, 42]);
function harness(options = {}, mutation) {
  const bytes = options.bytes ?? sample;
  const document = { storageBucket: "PRIVATE_BUCKET", storageKey: "PRIVATE_KEY",
    mimeType: "image/jpeg", byteLength: bytes.length, sha256: hash(bytes), ...options.row };
  const calls = [];
  const exports = {};
  const code = mutation ? source.replace(mutation.from, mutation.to) : source;
  vm.runInNewContext(ts.transpileModule(code, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, { exports, Buffer, require: name => {
    if (name === "server-only") return {};
    if (name === "node:crypto") return { createHash };
    assert.equal(name, "@/lib/supabase-admin", "reader dependency boundary");
    return { getSupabaseAdmin: () => {
      if (options.configError) throw new Error("PRIVATE_CONFIG");
      return { storage: { from: bucket => {
        assert.equal(bucket, document.storageBucket);
        return { download: async key => {
          calls.push([bucket, key]); assert.equal(key, document.storageKey);
          if (options.exception) throw new Error("PRIVATE_SDK");
          return { error: options.error ? { message: "PRIVATE_ERROR" } : null,
            data: options.absent ? null : { type: "text/html", arrayBuffer: async () => {
              if (options.readError) throw new Error("PRIVATE_READ");
              return Uint8Array.from(bytes).buffer;
            } } };
        } };
      } } };
    } };
  } });
  return { ...exports, calls, read: () => exports.readVerifiedMemberDocument(document), bytes };
}
async function unavailable(options, mutation) {
  const h = harness(options, mutation);
  await assert.rejects(h.read, error => {
    assert.ok(error instanceof h.MemberDocumentReadError);
    assert.equal(error.message, "MEMBER_DOCUMENT_UNAVAILABLE");
    assert.equal(error.cause, undefined);
    assert.equal(error.status, undefined);
    return true;
  });
}
async function exact(options, mutation) {
  const h = harness(options, mutation), result = await h.read();
  assert.deepEqual(Buffer.from(result.bytes), h.bytes);
  assert.equal(result.byteLength, h.bytes.length);
  assert.deepEqual(h.calls, [["PRIVATE_BUCKET", "PRIVATE_KEY"]]);
  return result;
}
test("JPEG/PNG/WEBP/PDF persisted MIME and exact complete bytes", async () => {
  for (const [format, mime, extension] of [["jpeg", "image/jpeg", "jpg"], ["png", "image/png", "png"], ["webp", "image/webp", "webp"]]) {
    const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).toFormat(format).toBuffer();
    const result = await exact({ bytes, row: { mimeType: mime } });
    assert.equal(result.mimeType, mime); assert.equal(result.extension, extension);
  }
  const pdf = await PDFDocument.create(); pdf.addPage();
  const result = await exact({ bytes: Buffer.from(await pdf.save()), row: { mimeType: "application/pdf" } });
  assert.equal(result.mimeType, "application/pdf"); assert.equal(result.extension, "pdf");
  await exact(); // Binary control bytes must also survive without decoding.
});
test("absence, SDK/config/read exceptions, empty, length, hash and MIME fail closed", async () => {
  for (const options of [{ absent: true }, { error: true }, { exception: true }, { configError: true },
    { readError: true }, { bytes: Buffer.alloc(0) }, { row: { byteLength: 999 } },
    { row: { sha256: "bad" } }, ...["text/html", "toString", "__proto__"].map(mimeType => ({ row: { mimeType } }))]) {
    await unavailable(options);
  }
});
test("canonical boundary: only persisted fields, no resolution, legacy, HTTP or side effects", () => {
  assert.match(source, /import "server-only"/);
  assert.doesNotMatch(source, /dniFrontUrl|dniBackUrl|parseLegacy|parseStorage|signedUrl|createSignedUrl|redirect|prisma|audit|memberId|token|Response/);
});
const mutations = [
  { name: "allow empty", from: "bytes.byteLength === 0", to: "false", check: m => unavailable({ bytes: Buffer.alloc(0) }, m) },
  { name: "omit hash", from: 'createHash("sha256").update(Buffer.from(bytes)).digest("hex") !== document.sha256', to: "false", check: m => unavailable({ row: { sha256: "bad" } }, m) },
  { name: "omit length", from: "bytes.byteLength !== document.byteLength", to: "false", check: m => unavailable({ row: { byteLength: 999 } }, m) },
  { name: "legacy fallback", from: 'throw new MemberDocumentReadError();\n  }', to: 'return { bytes: Buffer.from("legacy").buffer, mimeType: "image/jpeg" };\n  }', check: m => unavailable({ absent: true }, m) },
  { name: "signed URL", from: "const bytes = await download.data.arrayBuffer();", to: "await getSupabaseAdmin().storage.from(document.storageBucket).createSignedUrl(document.storageKey, 60); const bytes = await download.data.arrayBuffer();", check: m => exact({}, m) },
  { name: "transform bytes", from: "return { bytes, mimeType", to: "return { bytes: Buffer.from(bytes).reverse().buffer, mimeType", check: m => exact({}, m) },
];
for (const mutation of mutations) test(`sensitivity: ${mutation.name}`, async () => {
  assert.ok(source.includes(mutation.from));
  await assert.rejects(() => mutation.check(mutation));
});
