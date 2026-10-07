import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const card = "components/member-documents-card.tsx";
const item = "components/member-document-item.tsx";
const page = "app/members/[id]/page.tsx";
const mutations = [
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
  { name: "upload eagerly loads history", fails: "upload front: synchronous lock", edits: [{ file: card, from: 'if (historyRequested.current) void loadHistory(null, true);', to: 'void loadHistory(null, true);' }] },
  { name: "upload fails to refresh requested history", fails: "history stale upload reset", edits: [{ file: card, from: 'if (historyRequested.current) void loadHistory(null, true);', to: '' }] },
  { name: "legacy leaks into history", fails: "history metadata", edits: [{ file: card, from: '<ul className="mt-3 grid min-w-0 gap-3">', to: '<p>{initialBackUrl}</p><ul className="mt-3 grid min-w-0 gap-3">' }] },
  { name: "history image preview", fails: "history metadata", edits: [{ file: item, from: '!compact && (image ?', to: 'true && (image ?' }] },
  { name: "PDF becomes img", fails: "all types ordered", edits: [{ file: item, from: 'const image = ["image/jpeg", "image/png", "image/webp"].includes(item.mimeType);', to: 'const image = true;' }] },
  { name: "legacy counts as canonical", fails: "legacy alone", edits: [{ file: card, from: 'const front = items?.some(item => item.type === "ID_FRONT");', to: 'const front = Boolean(initialFrontUrl) || items?.some(item => item.type === "ID_FRONT");' }] },
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
