import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const card = "components/member-documents-card.tsx";
const item = "components/member-document-item.tsx";
const page = "app/members/[id]/page.tsx";
const mutations = [
  { name: "uncertain server response permits retry", fails: "uncertain HTTP", edits: [{ file: card, from: 'response.status >= 500', to: 'false' }] },
  { name: "old refresh unlocks uncertain POST", fails: "pre-upload refresh", edits: [{ file: card, from: 'const confirmsUncertain = uncertain.current;', to: 'const confirmsUncertain = true;' }] },
  { name: "file DOM reset removed", fails: "file DOM reset", edits: [{ file: card, from: 'if (fileInput.current) fileInput.current.value = "";', to: '' }] },
  { name: "DNI endpoint returns", fails: "general exact 5 MiB", edits: [{ file: card, from: '`/api/members/${memberId}/member-documents`, { method: "POST"', to: '`/api/members/${memberId}/dni`, { method: "POST"' }] },
  { name: "extra memberId field", fails: "general exact 5 MiB", edits: [{ file: card, from: 'form.set("type", type);', to: 'form.set("type", type); form.set("memberId", String(memberId));' }] },
  { name: "oversize permitted", fails: "general validation ID_FRONT 5242881", edits: [{ file: card, from: 'file.size > 5 * 1024 * 1024', to: 'false' }] },
  { name: "destructive copy", fails: "quick actions common form", edits: [{ file: card, from: 'Se conservarán los documentos anteriores.', to: 'reemplazar' }] },
  { name: "separate quick uploader", fails: "quick actions common form", edits: [{ file: card, from: 'fileInput.current?.focus();', to: 'void upload();' }] },
  { name: "optimistic fabricated item", fails: "general exact 5 MiB", edits: [{ file: card, from: 'setUploading(true);', to: 'setUploading(true); setItems([{ id: 999, type: "ID_FRONT", mimeType: "application/pdf", originalName: "fake", byteLength: 1, createdAt: "2026-10-01", isCurrent: true }]);' }] },
  { name: "automatic POST retry", fails: "upload uncertain:", edits: [{ file: card, from: 'uncertain.current = true;', to: 'void fetch(`/api/members/${memberId}/member-documents`, { method: "POST", body: form }).catch(() => {}); uncertain.current = true;' }] },
  { name: "cached current IDs override history markers", fails: "history honors newer B", edits: [{ file: card, from: 'const current = item.isCurrent;', to: 'const current = items !== null && !loading && !error ? items.some(document => document.id === item.id) : item.isCurrent;' }] },
  { name: "history pages retain conflicting current markers", fails: "history pagination reconciles", edits: [{ file: card, from: 'currentTypes.has(item.type)', to: 'false' }] },
  { name: "history duplicate keeps old marker", fails: "history pagination reconciles", edits: [{ file: card, from: 'incoming.get(item.id) ??', to: '' }] },
  { name: "old history overwrites newest markers", fails: "history newest markers survive", edits: [{ file: card, from: 'mounted.current && historyGeneration.current === version', to: 'mounted.current' }] },
  { name: "history eager mount", fails: "history lazy", edits: [{ file: card, from: 'void refresh();', to: 'void refresh(); void loadHistory();' }] },
  { name: "history reopen refetch", fails: "history lazy", edits: [{ file: card, from: '!historyOpen && !historyRequested.current', to: '!historyOpen' }] },
  { name: "history cursor lost on error", fails: "history pagination", edits: [{ file: card, from: 'else setPageError(true);', to: 'else { setPageError(true); setNextCursor(null); }' }] },
  { name: "history double page request", fails: "history pagination", edits: [{ file: card, from: '(historyLock.current && !reset)', to: 'false' }] },
  { name: "history duplicate IDs", fails: "history pagination", edits: [{ file: card, from: 'if (seen.has(item.id)) return false;', to: 'if (false) return false;' }] },
  { name: "history stale page after upload", fails: "history stale upload reset", edits: [{ file: card, from: 'mounted.current && historyGeneration.current === version', to: 'mounted.current' }] },
  { name: "upload eagerly loads history", fails: "upload front: synchronous lock", edits: [{ file: card, from: 'const historyRefresh = historyRequested.current ? loadHistory(null, true) : Promise.resolve(true);', to: 'const historyRefresh = loadHistory(null, true);' }] },
  { name: "upload fails to refresh requested history", fails: "history stale upload reset", edits: [{ file: card, from: 'const historyRefresh = historyRequested.current ? loadHistory(null, true) : Promise.resolve(true);', to: 'const historyRefresh = Promise.resolve(true);' }] },
  { name: "legacy leaks into history", fails: "history metadata", edits: [{ file: card, from: '<ul className="mt-3 grid min-w-0 gap-3">', to: '<p>{initialBackUrl}</p><ul className="mt-3 grid min-w-0 gap-3">' }] },
  { name: "history image preview", fails: "history metadata", edits: [{ file: item, from: '!compact && (image ?', to: 'true && (image ?' }] },
  { name: "PDF becomes img", fails: "all types ordered", edits: [{ file: item, from: 'const image = ["image/jpeg", "image/png", "image/webp"].includes(item.mimeType);', to: 'const image = true;' }] },
  ...["AUTHORIZATION", "PROOF", "ANNEX", "OTHER"].map(type => ({ name: `extra UI type ${type}`, fails: "DNI form only two slots", edits: [{ file: card, from: 'const dniTypes = ["ID_FRONT", "ID_BACK"] as const;', to: `const dniTypes = ["ID_FRONT", "ID_BACK", "${type}"] as const;` }] })),
  { name: "general selector returns", fails: "DNI form only two slots", edits: [{ file: card, from: '<label className="block text-sm font-semibold"', to: '<select><option>Otro</option></select><label className="block text-sm font-semibold"' }] },
  { name: "legacy disappears", fails: "legacy visible authenticated", edits: [{ file: card, from: 'const legacyAvailable = !item', to: 'const legacyAvailable = false && !item' }] },
  { name: "legacy overrides canonical", fails: "preview image/png", edits: [
    { file: card, from: 'const legacyAvailable = !item', to: 'const legacyAvailable = true' },
    { file: card, from: '{item ? <MemberDocumentItem', to: '{item && !legacyAvailable ? <MemberDocumentItem' },
  ] },
  { name: "legacy uses storage URL", fails: "legacy visible authenticated", edits: [{ file: card, from: 'const legacyUrl = `/api/members/${memberId}/documents?side=${side}`;', to: 'const legacyUrl = side === "front" ? initialFrontUrl : initialBackUrl;' }] },
  { name: "photo lost on page", fails: "photo existing and refreshed", edits: [{ file: page, from: 'initialPhotoUrl={data.member.photoUrl}', to: 'initialPhotoUrl={null}' }] },
  { name: "photo stale initial URL returns", fails: "photo existing and refreshed", edits: [{ file: page, from: 'key={`${id}:${data.member.photoUrl ?? ""}`}', to: '' }] },
  { name: "history extra types return", fails: "history filters all extra types", edits: [{ file: card, from: 'merged.filter(isDni).filter', to: 'merged.filter' }] },
  { name: "synchronous guard removed", fails: "upload front: synchronous lock", edits: [{ file: card, from: 'if (uploadLock.current || !canUpload || !mounted.current) return;', to: 'if (!canUpload || !mounted.current) return;' }] },
  { name: "successful POST misreported on refresh failure", fails: "upload refreshFailed:", edits: [{ file: card, from: 'Documento incorporado. No se pudo actualizar el listado.', to: 'No se pudo subir el documento.' }] },
  { name: "general refreshMember reactivated", fails: "whole page upload", edits: [
    { file: page, from: 'initialBackUrl={data.member.dniBackUrl}', to: 'initialBackUrl={data.member.dniBackUrl} onUploaded={refreshMember}' },
    { file: card, from: 'canUpload = false }: Props)', to: 'canUpload = false, onUploaded }: Props)' },
    { file: card, from: 'const refreshed = await refresh();', to: 'await onUploaded?.(); const refreshed = await refresh();' },
  ] },
  { name: "stale generation guard removed", fails: "older success arriving", edits: [{ file: card, from: 'mounted.current && generation.current === version', to: 'mounted.current' }] },
  { name: "member response.ok removed", fails: "member initial load http:", edits: [{ file: page, from: 'if (!historyRes.ok) throw new Error("Member unavailable");', to: '' }] },
  { name: "member error leaves loading forever", fails: "member initial load network:", edits: [{ file: page, from: 'setInitialError("No se pudo cargar la ficha del socio. Vuelve a abrir la ficha para reintentar.");', to: '' }] },
  { name: "hash href returns", fails: "all types ordered", edits: [{ file: item, from: 'href={inline}', to: 'href="#"' }] },
];
for (const mutation of mutations) test(`sensitivity: ${mutation.name}`, () => {
  const childEnv = { ...process.env, MEMBER_DOCUMENT_UI_MUTATIONS: JSON.stringify(mutation.edits) };
  delete childEnv.NODE_TEST_CONTEXT; // Start a fresh runner, not a nested worker.
  const result = spawnSync(process.execPath, ["--test", "--test-reporter=tap", fileURLToPath(new URL("./test-member-documents-ui.mjs", import.meta.url))], {
    encoding: "utf8", timeout: 30000,
    env: childEnv,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  assert.notEqual(result.status, 0, "Mutation survived behavioral suite");
  const output = result.stdout + result.stderr;
  assert.doesNotMatch(output, /Mutation anchor missing/);
  assert.ok(output.split("\n").some(line => line.startsWith("not ok ") && line.includes(mutation.fails)), output);
});
