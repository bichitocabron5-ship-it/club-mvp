import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
const require = createRequire(import.meta.url);
export const tick = () => new Promise(resolve => setImmediate(resolve));
export const text = n => typeof n === "string" || typeof n === "number" ? String(n) : Array.isArray(n) ? n.map(text).join("") : n?.props ? text(n.props.children) : "";
export const nodes = n => Array.isArray(n) ? n.flatMap(nodes) : n && typeof n === "object" ? [n, ...nodes(n.props?.children)] : [];
export function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }

// Executes production components/callbacks with simulated hook lifecycles, not a browser renderer.
export function uiHarness({ path = "components/member-documents-card.tsx", name = "MemberDocumentsCard", props = {}, fetch, mocks = {} }) {
  const instances = new Map(), cache = new Map();
  let active, cursor, tree, effects = [], used, lateUpdates = 0;
  const hooks = {
    useState(initial) { const owner = active, i = cursor++; if (!(i in owner.slots)) owner.slots[i] = typeof initial === "function" ? initial() : initial;
      return [owner.slots[i], value => { if (owner.dead) lateUpdates++; if (!owner.dead) owner.slots[i] = typeof value === "function" ? value(owner.slots[i]) : value; }]; },
    useRef(initial) { const i = cursor++; return active.slots[i] ??= { current: initial }; },
    useCallback(fn, deps) { const i = cursor++, old = active.slots[i]; if (!old || deps.some((v, j) => v !== old.deps[j])) active.slots[i] = { fn, deps }; return active.slots[i].fn; },
    useEffect(fn, deps) { const owner = active, i = cursor++, old = owner.slots[i];
      if (!old || deps.some((v, j) => v !== old.deps[j])) { owner.slots[i] = { deps, cleanup: old?.cleanup }; effects.push(() => { old?.cleanup?.(); owner.slots[i].cleanup = fn(); }); } },
  };
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const exports = {}; cache.set(file, exports);
    let source = readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
    // Test-only source transformations are applied in memory, never to repository files.
    for (const mutation of JSON.parse(process.env.MEMBER_DOCUMENT_UI_MUTATIONS ?? "[]")) {
      if (mutation.file !== file) continue;
      if (!source.includes(mutation.from)) throw new Error(`Mutation anchor missing: ${mutation.file}`);
      source = source.replace(mutation.from, mutation.to);
    }
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
      exports, fetch, FormData, AbortController, URLSearchParams, console, setTimeout, clearTimeout,
      window: { location: { reload() {} } },
      require: id => {
        if (id === "react") return hooks;
        if (id in mocks) return mocks[id];
        if (id.startsWith("@/")) { const base = id.slice(2); return load(base + (existsSync(new URL(`../../${base}.ts`, import.meta.url)) ? ".ts" : ".tsx")); }
        return require(id);
      },
    }, { filename: file });
    return exports;
  }
  const Component = load(path)[name];
  function visit(node, key) {
    if (Array.isArray(node)) return node.map((n, i) => visit(n, `${key}/${n?.key ?? i}`));
    if (!node || typeof node !== "object") return node;
    if (typeof node.type === "function") {
      const id = `${key}/${node.type.name}:${node.key ?? ""}`;
      used.add(id);
      const owner = instances.get(id) ?? { slots: [], dead: false }; instances.set(id, owner);
      active = owner; cursor = 0;
      return visit(node.type(node.props), id);
    }
    return { ...node, props: { ...node.props, children: visit(node.props?.children, `${key}/children`) } };
  }
  function cleanup(owner) { owner.dead = true; owner.slots.forEach(slot => slot?.cleanup?.()); }
  const api = {
    render(next = props) { props = next; used = new Set(); tree = visit({ type: Component, props }, "root");
      for (const [id, owner] of instances) if (!used.has(id)) { cleanup(owner); instances.delete(id); }
      for (const effect of effects.splice(0)) effect(); return tree; },
    async flush() { await tick(); api.render(); await tick(); api.render(); },
    get lateUpdates() { return lateUpdates; },
    get tree() { return tree; }, get nodes() { return nodes(tree); }, get text() { return text(tree); },
    button(label) { return api.nodes.find(n => n.type === "button" && text(n) === label); },
    unmount() { for (const owner of instances.values()) cleanup(owner); instances.clear(); },
  };
  api.render(); return api;
}
