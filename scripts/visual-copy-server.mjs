import { createServer } from "node:http";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import {
  appendFile,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { pages as sitePages } from "./site-data.mjs";
import {
  applyCopyOverrides,
  assertSafeCopyHtml,
  discoverEditableCopy,
  instrumentHtml,
  loadCopyRegistry,
  saveCopyRegistry,
  setCopyOverride,
} from "./visual-copy-model.mjs";

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
const EDITOR_DIR = path.join(SCRIPT_DIR, "visual-copy-editor");
const REGISTRY_PATH = path.join(ROOT_DIR, "content", "visual-copy.json");
const HISTORY_PATH = path.resolve(ROOT_DIR, "..", ".visual-copy-editor", "history.jsonl");
const HOST = "127.0.0.1";
const DEFAULT_PORT = 4174;
const BODY_LIMIT = 64 * 1024;
const MAX_CHANGES = 40;
const BUILD_TIMEOUT_MS = 120_000;
const CSRF_TOKEN = randomBytes(32).toString("base64url");

const EDITOR_FILES = new Map([
  ["/__editor/editor.css", "editor.css"],
  ["/__editor/editor.js", "editor.js"],
  ["/__editor/bridge.js", "bridge.js"],
  ["/scripts/visual-copy-editor/editor.css", "editor.css"],
  ["/scripts/visual-copy-editor/editor.js", "editor.js"],
  ["/scripts/visual-copy-editor/bridge.js", "bridge.js"],
]);

const PAGE_LIST = Object.freeze([
  ...sitePages.map((page) => ({
    file: page.file,
    label: page.file === "index.html" ? "Home" : page.title.split(" | ")[0],
  })),
  { file: "404.html", label: "Page not found (404)" },
]);
const ALLOWED_PAGES = new Set(PAGE_LIST.map((page) => page.file));
const GENERATED_FILES = Object.freeze([
  ...ALLOWED_PAGES,
  "sitemap.xml",
  "site.webmanifest",
  "SOURCE_LEDGER.md",
  "SOURCE_LEDGER.csv",
  "content/visual-copy.json",
]);
const BUILD_STEPS = Object.freeze([
  { label: "Site synchronization", script: "sync-site.mjs" },
  { label: "Source ledger", script: "generate-source-ledger.mjs" },
  { label: "Visual copy governance", script: "validate-visual-copy.mjs" },
  { label: "Site validation", script: "validate-site.mjs" },
]);
const STATIC_ROOT_FILES = new Set([
  "styles.css",
  "script.js",
  "favicon.svg",
  "favicon.ico",
  "site.webmanifest",
]);

let saveQueue = Promise.resolve();
let activePort = DEFAULT_PORT;

function parsePort(argv) {
  const index = argv.indexOf("--port");
  if (index === -1) return DEFAULT_PORT;
  const candidate = Number(argv[index + 1]);
  if (!Number.isInteger(candidate) || candidate < 1024 || candidate > 65535) {
    throw new Error("The editor port must be a whole number from 1024 through 65535.");
  }
  return candidate;
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function constantTimeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function isLoopbackAddress(address = "") {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function approvedHostHeader(hostHeader = "") {
  const normalized = String(hostHeader).toLowerCase();
  return normalized === `127.0.0.1:${activePort}` || normalized === `localhost:${activePort}`;
}

function requestOrigin(req) {
  return `http://${req.headers.host}`;
}

function requestIsLocal(req) {
  return isLoopbackAddress(req.socket.remoteAddress) && approvedHostHeader(req.headers.host);
}

function postIsSameOrigin(req) {
  const origin = req.headers.origin;
  const fetchSite = req.headers["sec-fetch-site"];
  if (typeof origin !== "string" || fetchSite !== "same-origin") return false;
  try {
    const parsed = new URL(origin);
    const expected = new URL(requestOrigin(req));
    return parsed.protocol === "http:" && parsed.origin === expected.origin;
  } catch {
    return false;
  }
}

function commonHeaders(contentType, extra = {}) {
  return {
    "Content-Type": contentType,
    "Cache-Control": "no-store, max-age=0",
    Pragma: "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Resource-Policy": "same-origin",
    ...extra,
  };
}

function sendJson(res, statusCode, payload) {
  const body = `${JSON.stringify(payload)}\n`;
  res.writeHead(statusCode, commonHeaders("application/json; charset=utf-8", {
    "Content-Length": Buffer.byteLength(body),
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  }));
  res.end(body);
}

function sendText(res, statusCode, body, contentType = "text/plain; charset=utf-8", extra = {}) {
  res.writeHead(statusCode, commonHeaders(contentType, {
    "Content-Length": Buffer.byteLength(body),
    ...extra,
  }));
  res.end(body);
}

function editorCsp() {
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "frame-src 'self'",
    "font-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

function previewCsp() {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'self'",
  ].join("; ");
}

function contentTypeFor(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".html": return "text/html; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    case ".js":
    case ".mjs": return "text/javascript; charset=utf-8";
    case ".json":
    case ".webmanifest": return "application/manifest+json; charset=utf-8";
    case ".svg": return "image/svg+xml";
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".webp": return "image/webp";
    case ".avif": return "image/avif";
    case ".gif": return "image/gif";
    case ".woff": return "font/woff";
    case ".woff2": return "font/woff2";
    case ".ico": return "image/x-icon";
    default: return "application/octet-stream";
  }
}

async function readRequestJson(req) {
  const contentType = String(req.headers["content-type"] || "").toLowerCase();
  if (!contentType.startsWith("application/json")) {
    const error = new Error("The save request must use JSON.");
    error.statusCode = 415;
    throw error;
  }
  const declaredLength = Number(req.headers["content-length"] || 0);
  if (declaredLength > BODY_LIMIT) {
    const error = new Error("The requested copy change is too large.");
    error.statusCode = 413;
    throw error;
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > BODY_LIMIT) {
      const error = new Error("The requested copy change is too large.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("The save request was not valid JSON.");
    error.statusCode = 400;
    throw error;
  }
}

function normalizePage(value) {
  if (typeof value !== "string" || !ALLOWED_PAGES.has(value)) return null;
  if (value.includes("\\") || value.includes("..") || path.isAbsolute(value)) return null;
  return value;
}

function registryPage(registry, pageFile) {
  return registry?.pages?.find((page) => page.path === pageFile) || null;
}

function currentEntryHtml(entry) {
  return typeof entry.overrideHtml === "string" ? entry.overrideHtml : entry.sourceHtml;
}

function currentEntryRevision(entry) {
  return typeof entry.overrideHtml === "string"
    ? entry.overrideHash || sha256(entry.overrideHtml)
    : entry.sourceHash;
}

function registryEntryMap(pageRecord) {
  return new Map((pageRecord?.entries || []).map((entry) => [entry.id, entry]));
}

function restoreRegisteredSourceHtml(html, pageFile, registry) {
  const pageRecord = registryPage(registry, pageFile);
  if (!pageRecord) throw new Error(`The governed copy registry is missing ${pageFile}.`);

  // This first pass is the drift gate. It accepts only the registered source or
  // the previously approved override, then normalizes the page to that old
  // registry before any transition is attempted.
  const normalized = applyCopyOverrides(html, pageFile, registry, {
    instrument: false,
    strict: true,
  });
  const discovered = discoverEditableCopy(normalized, pageFile);
  const registeredById = registryEntryMap(pageRecord);
  const replacements = [];

  for (const current of discovered.entries) {
    const registered = registeredById.get(current.id);
    if (!registered) continue;
    const approvedHash = registered.overrideHash ?? registered.sourceHash;
    if (!constantTimeEqual(current.sourceHash, approvedHash)) {
      throw new Error(`The governed copy changed during the ${pageFile} transition.`);
    }
    replacements.push({
      start: current.innerStart,
      end: current.innerEnd,
      value: registered.sourceHtml,
    });
  }
  if (replacements.length !== pageRecord.entries.length) {
    throw new Error(`The governed copy fields could not be reconciled for ${pageFile}.`);
  }

  let sourceHtml = normalized;
  for (const replacement of replacements.sort((left, right) => right.start - left.start)) {
    sourceHtml = `${sourceHtml.slice(0, replacement.start)}${replacement.value}${sourceHtml.slice(replacement.end)}`;
  }
  return sourceHtml;
}

function transitionPageHtml(html, pageFile, previousRegistry, nextRegistry) {
  const registeredSource = restoreRegisteredSourceHtml(html, pageFile, previousRegistry);
  return applyCopyOverrides(registeredSource, pageFile, nextRegistry, {
    instrument: false,
    strict: true,
  });
}

async function materializeRegistryTransition(previousRegistry, nextRegistry) {
  for (const pageFile of ALLOWED_PAGES) {
    const filePath = path.join(ROOT_DIR, ...pageFile.split("/"));
    const currentHtml = await readFile(filePath, "utf8");
    const nextHtml = transitionPageHtml(currentHtml, pageFile, previousRegistry, nextRegistry);
    await atomicWrite(filePath, nextHtml);
  }
}

function normalizeSourceText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function isFooterEntry(entry) {
  return /footer/i.test(String(entry?.kind || ""));
}

function tokenizeHtmlFragment(html) {
  return String(html).split(/(<[^>]+>)/g).filter((token) => token !== "");
}

function tagSignature(token) {
  const match = /^<\s*(\/?)\s*([a-z][\w:-]*)\b/i.exec(token);
  return match ? `${match[1] ? "/" : ""}${match[2].toLowerCase()}` : token;
}

function transferTextPreservingTargetMarkup(sourceHtml, replacementHtml, targetHtml) {
  const sourceTokens = tokenizeHtmlFragment(sourceHtml);
  const replacementTokens = tokenizeHtmlFragment(replacementHtml);
  const targetTokens = tokenizeHtmlFragment(targetHtml);
  if (sourceTokens.length !== replacementTokens.length || sourceTokens.length !== targetTokens.length) {
    throw new Error("The shared footer structure did not match on every page.");
  }

  return targetTokens.map((targetToken, index) => {
    const sourceIsTag = sourceTokens[index].startsWith("<");
    const replacementIsTag = replacementTokens[index].startsWith("<");
    const targetIsTag = targetToken.startsWith("<");
    if (sourceIsTag !== replacementIsTag || sourceIsTag !== targetIsTag) {
      throw new Error("The shared footer structure did not match on every page.");
    }
    if (!sourceIsTag) return replacementTokens[index];
    if (
      tagSignature(sourceTokens[index]) !== tagSignature(replacementTokens[index]) ||
      tagSignature(sourceTokens[index]) !== tagSignature(targetToken)
    ) {
      throw new Error("The shared footer structure did not match on every page.");
    }
    return targetToken;
  }).join("");
}

function validatePayload(payload, pageRecord) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw Object.assign(new Error("The save request was incomplete."), { statusCode: 400 });
  }
  if (!constantTimeEqual(payload.csrfToken, CSRF_TOKEN)) {
    throw Object.assign(new Error("The editor session expired. Reload the editor and try again."), { statusCode: 403 });
  }
  if (!Array.isArray(payload.changes) || payload.changes.length === 0 || payload.changes.length > MAX_CHANGES) {
    throw Object.assign(new Error("Choose at least one copy field, and save no more than 40 fields at once."), { statusCode: 400 });
  }

  const entryById = new Map(pageRecord.entries.map((entry) => [entry.id, entry]));
  const seenIds = new Set();
  return payload.changes.map((change) => {
    if (!change || typeof change !== "object" || Array.isArray(change)) {
      throw Object.assign(new Error("One of the copy changes was incomplete."), { statusCode: 400 });
    }
    const { copyId, html, revision } = change;
    if (typeof copyId !== "string" || !entryById.has(copyId) || seenIds.has(copyId)) {
      throw Object.assign(new Error("A selected copy field is not valid for this page."), { statusCode: 400 });
    }
    if (typeof html !== "string" || html.length > 16_000) {
      throw Object.assign(new Error("One of the copy changes is too large."), { statusCode: 400 });
    }
    if (typeof revision !== "string" || !/^[a-f0-9]{64}$/i.test(revision)) {
      throw Object.assign(new Error("A selected copy field has an invalid revision."), { statusCode: 409 });
    }
    const entry = entryById.get(copyId);
    if (!constantTimeEqual(revision.toLowerCase(), currentEntryRevision(entry).toLowerCase())) {
      throw Object.assign(new Error("This page changed after you opened it. Reload the preview before saving."), { statusCode: 409 });
    }
    try {
      assertSafeCopyHtml(entry.sourceHtml, html);
    } catch (error) {
      throw Object.assign(new Error(error?.message || "The revised copy changed protected page markup."), { statusCode: 422 });
    }
    seenIds.add(copyId);
    return { entry, html };
  });
}

function addPlannedChange(planned, pageFile, entry, html, explicit) {
  const key = `${pageFile}\u0000${entry.id}`;
  const existing = planned.get(key);
  if (existing && existing.html !== html) {
    throw Object.assign(new Error("Two edits conflict with the same governed copy field."), { statusCode: 409 });
  }
  if (!existing) {
    planned.set(key, {
      page: pageFile,
      entry,
      html,
      beforeHtml: currentEntryHtml(entry),
      explicit,
    });
  } else if (explicit) {
    existing.explicit = true;
  }
}

function planChanges(registry, requestedPage, validatedChanges) {
  const planned = new Map();
  for (const change of validatedChanges) {
    addPlannedChange(planned, requestedPage, change.entry, change.html, true);
    if (!isFooterEntry(change.entry)) continue;

    const governedPagePaths = new Set(
      registry.pages.filter((page) => ALLOWED_PAGES.has(page.path)).map((page) => page.path),
    );
    if ([...ALLOWED_PAGES].some((pageFile) => !governedPagePaths.has(pageFile))) {
      throw Object.assign(
        new Error("The shared footer registry is incomplete, so no footer copy was saved."),
        { statusCode: 422 },
      );
    }
    const sourceText = normalizeSourceText(change.entry.sourceText);
    const sourceTag = String(change.entry.tag || "").toLowerCase();
    for (const pageRecord of registry.pages.filter((page) => ALLOWED_PAGES.has(page.path))) {
      const matches = pageRecord.entries.filter((candidate) =>
        isFooterEntry(candidate) &&
        String(candidate.tag || "").toLowerCase() === sourceTag &&
        normalizeSourceText(candidate.sourceText) === sourceText
      );
      if (matches.length === 0) {
        throw Object.assign(
          new Error("The shared footer could not be matched safely on every page. Nothing was saved."),
          { statusCode: 422 },
        );
      }
      for (const target of matches) {
        const mappedHtml = transferTextPreservingTargetMarkup(
          change.entry.sourceHtml,
          change.html,
          target.sourceHtml,
        );
        try {
          assertSafeCopyHtml(target.sourceHtml, mappedHtml);
        } catch (error) {
          throw Object.assign(
            new Error(error?.message || "The shared footer structure did not match on every page."),
            { statusCode: 422 },
          );
        }
        addPlannedChange(
          planned,
          pageRecord.path,
          target,
          mappedHtml,
          pageRecord.path === requestedPage && target.id === change.entry.id,
        );
      }
    }
  }
  return [...planned.values()].filter((change) => change.beforeHtml !== change.html);
}

async function snapshotFiles() {
  const snapshot = new Map();
  for (const relativePath of GENERATED_FILES) {
    const filePath = path.join(ROOT_DIR, ...relativePath.split("/"));
    try {
      snapshot.set(relativePath, { exists: true, data: await readFile(filePath) });
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      snapshot.set(relativePath, { exists: false, data: null });
    }
  }
  return snapshot;
}

async function atomicWrite(filePath, data) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.restore-${process.pid}-${randomBytes(5).toString("hex")}`;
  try {
    await writeFile(tempPath, data);
    try {
      await rename(tempPath, filePath);
    } catch (error) {
      if (process.platform !== "win32" || !["EEXIST", "EPERM"].includes(error?.code)) throw error;
      await writeFile(filePath, data);
      await rm(tempPath, { force: true });
    }
  } finally {
    await rm(tempPath, { force: true }).catch(() => {});
  }
}

async function restoreSnapshot(snapshot) {
  for (const [relativePath, saved] of snapshot) {
    const filePath = path.join(ROOT_DIR, ...relativePath.split("/"));
    if (saved.exists) {
      await atomicWrite(filePath, saved.data);
    } else {
      await rm(filePath, { force: true });
    }
  }
}

function cleanBuildOutput(value) {
  const text = String(value || "")
    .replaceAll(ROOT_DIR, "[site]")
    .replace(/[A-Za-z]:\\[^\r\n]+/g, "[local path]")
    .trim();
  const lines = text.split(/\r?\n/).filter(Boolean);
  return lines.slice(-8).join("\n").slice(0, 1400);
}

function safeErrorMessage(value, fallback = "Nothing was saved. The prior files were restored.") {
  const cleaned = cleanBuildOutput(value).replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, 600) : fallback;
}

async function runBuild() {
  const results = [];
  for (const step of BUILD_STEPS) {
    const startedAt = Date.now();
    try {
      const { stdout, stderr } = await execFileAsync(
        process.execPath,
        [path.join(SCRIPT_DIR, step.script)],
        {
          cwd: ROOT_DIR,
          shell: false,
          timeout: BUILD_TIMEOUT_MS,
          windowsHide: true,
          maxBuffer: 4 * 1024 * 1024,
          env: { ...process.env, NO_COLOR: "1" },
        },
      );
      results.push({
        step: step.label,
        status: "passed",
        durationMs: Date.now() - startedAt,
        detail: cleanBuildOutput(stdout || stderr),
      });
    } catch (error) {
      error.buildStep = step.label;
      error.safeDetail = cleanBuildOutput(error.stderr || error.stdout || error.message);
      error.completedSteps = results;
      throw error;
    }
  }
  return results;
}

async function appendHistory(requestedPage, changes, buildResults) {
  await mkdir(path.dirname(HISTORY_PATH), { recursive: true });
  const event = {
    timestamp: new Date().toISOString(),
    action: "visual-copy-save",
    requestedPage,
    requestedCount: changes.filter((change) => change.explicit).length,
    appliedCount: changes.length,
    changes: changes.map((change) => ({
      page: change.page,
      copyId: change.entry.id,
      kind: change.entry.kind,
      beforeHtml: change.beforeHtml,
      afterHtml: change.html,
      beforeHash: sha256(change.beforeHtml),
      afterHash: sha256(change.html),
      propagated: !change.explicit,
    })),
    validation: buildResults.map(({ step, status, durationMs }) => ({ step, status, durationMs })),
    published: false,
  };
  await appendFile(HISTORY_PATH, `${JSON.stringify(event)}\n`, "utf8");
}

function validationPayload(buildResults) {
  return {
    summary: "Rebuild complete. All four local checks passed. The site was not published.",
    checks: buildResults.map(({ step, status, durationMs }) => ({ step, status, durationMs })),
    published: false,
  };
}

async function performSave(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw Object.assign(new Error("The save request was incomplete."), { statusCode: 400 });
  }
  if (!constantTimeEqual(payload.csrfToken, CSRF_TOKEN)) {
    throw Object.assign(new Error("The editor session expired. Reload the editor and try again."), { statusCode: 403 });
  }
  const pageFile = normalizePage(payload.page);
  if (!pageFile) {
    throw Object.assign(new Error("The selected page is not available in this editor."), { statusCode: 400 });
  }

  const registry = await loadCopyRegistry(REGISTRY_PATH);
  const pageRecord = registryPage(registry, pageFile);
  if (!pageRecord) {
    throw Object.assign(new Error("The selected page is missing from the governed copy registry."), { statusCode: 409 });
  }
  const validated = validatePayload(payload, pageRecord);
  const planned = planChanges(registry, pageFile, validated);
  if (planned.length === 0) {
    throw Object.assign(new Error("There are no new copy changes to save."), { statusCode: 400 });
  }

  const snapshot = await snapshotFiles();
  let nextRegistry = registry;
  const updatedAt = new Date().toISOString();
  try {
    for (const change of planned) {
      nextRegistry = setCopyOverride(nextRegistry, change.entry.id, change.html, {
        expectedSourceHash: change.entry.sourceHash,
        updatedAt,
        updatedBy: "visual-copy-editor",
      });
    }
    await materializeRegistryTransition(registry, nextRegistry);
    await saveCopyRegistry(nextRegistry, REGISTRY_PATH, { rootDir: ROOT_DIR, validate: true });
    const buildResults = await runBuild();
    await appendHistory(pageFile, planned, buildResults);

    const requestedResults = validated.map((change) => ({
      copyId: change.entry.id,
      html: change.html,
      revision: sha256(change.html),
      sourceHash: change.entry.sourceHash,
    }));
    return {
      ok: true,
      message: `${requestedResults.length} ${requestedResults.length === 1 ? "change was" : "changes were"} saved locally. The rebuilt site passed every check and was not published.`,
      changes: requestedResults,
      propagatedChanges: planned.filter((change) => !change.explicit).length,
      csrfToken: CSRF_TOKEN,
      validation: validationPayload(buildResults),
      published: false,
    };
  } catch (error) {
    try {
      await restoreSnapshot(snapshot);
      error.rollbackConfirmed = true;
    } catch {
      error.rollbackConfirmed = false;
    }
    throw error;
  }
}

async function serveEditorFile(res, fileName) {
  const filePath = path.join(EDITOR_DIR, fileName);
  try {
    const body = await readFile(filePath);
    const isIndex = fileName === "index.html";
    sendText(res, 200, body, contentTypeFor(filePath), {
      "Content-Security-Policy": isIndex ? editorCsp() : "default-src 'none'",
    });
  } catch (error) {
    if (error?.code === "ENOENT") {
      sendText(res, 404, "Editor asset not found.\n");
      return;
    }
    throw error;
  }
}

function injectPreviewShell(html, pageFile) {
  const directory = path.posix.dirname(pageFile);
  const baseHref = directory === "." ? "/" : `/${directory}/`;
  const base = `<base href="${baseHref}">`;
  const bridge = `<script src="/__editor/bridge.js"></script>`;
  const styles = `<style>
    [data-copy-id] { cursor: text !important; outline: 1px dashed rgba(20, 121, 90, .38); outline-offset: 3px; transition: outline-color .15s, box-shadow .15s; }
    [data-copy-id]:hover, [data-copy-id]:focus { outline: 2px solid #14795a; box-shadow: 0 0 0 4px rgba(20, 121, 90, .13); }
    [data-copy-id].vce-copy-selected { outline: 3px solid #0d6b50; box-shadow: 0 0 0 6px rgba(13, 107, 80, .16); }
    [data-copy-id].vce-copy-dirty { outline-color: #b56b16; box-shadow: 0 0 0 5px rgba(181, 107, 22, .16); }
    .vce-sr-only { position: absolute !important; width: 1px !important; height: 1px !important; padding: 0 !important; margin: -1px !important; overflow: hidden !important; clip: rect(0, 0, 0, 0) !important; white-space: nowrap !important; border: 0 !important; }
  </style>`;
  let result = html.replace(/<head(\s[^>]*)?>/i, (match) => `${match}\n    ${base}\n    ${styles}`);
  if (result === html) result = `${base}${styles}${html}`;
  if (/<\/body\s*>/i.test(result)) {
    result = result.replace(/<\/body\s*>/i, `${bridge}\n</body>`);
  } else {
    result += bridge;
  }
  return result;
}

async function servePreview(res, url) {
  const pageFile = normalizePage(url.searchParams.get("path"));
  if (!pageFile) {
    sendText(res, 400, "That page is not available in the local editor.\n");
    return;
  }
  const registry = await loadCopyRegistry(REGISTRY_PATH);
  const source = await readFile(path.join(ROOT_DIR, ...pageFile.split("/")), "utf8");
  const instrumented = instrumentHtml(source, pageFile, registry, { strict: true });
  const body = injectPreviewShell(instrumented, pageFile);
  sendText(res, 200, body, "text/html; charset=utf-8", {
    "Content-Security-Policy": previewCsp(),
    "X-Frame-Options": "SAMEORIGIN",
  });
}

async function serveStaticAsset(res, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname).replace(/^\/+/, "");
  } catch {
    sendText(res, 400, "Invalid asset path.\n");
    return;
  }
  if (
    decoded.includes("\\") ||
    decoded.includes("..") ||
    path.isAbsolute(decoded) ||
    !(STATIC_ROOT_FILES.has(decoded) || decoded.startsWith("assets/"))
  ) {
    sendText(res, 404, "Asset not found.\n");
    return;
  }
  const filePath = path.resolve(ROOT_DIR, ...decoded.split("/"));
  if (!filePath.startsWith(`${ROOT_DIR}${path.sep}`)) {
    sendText(res, 404, "Asset not found.\n");
    return;
  }
  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw Object.assign(new Error("Not a file"), { code: "ENOENT" });
    const body = await readFile(filePath);
    sendText(res, 200, body, contentTypeFor(filePath), {
      "Content-Security-Policy": "default-src 'none'",
    });
  } catch (error) {
    if (error?.code === "ENOENT") {
      sendText(res, 404, "Asset not found.\n");
      return;
    }
    throw error;
  }
}

async function routeRequest(req, res) {
  if (!requestIsLocal(req)) {
    sendText(res, 403, "The Visual Copy Editor is available only on this computer.\n");
    return;
  }
  const url = new URL(req.url || "/", requestOrigin(req));
  if (req.method === "GET" && (url.pathname === "/__editor" || url.pathname === "/__editor/")) {
    await serveEditorFile(res, "index.html");
    return;
  }
  if (req.method === "GET" && EDITOR_FILES.has(url.pathname)) {
    await serveEditorFile(res, EDITOR_FILES.get(url.pathname));
    return;
  }
  if (req.method === "GET" && url.pathname === "/__editor/api/pages") {
    sendJson(res, 200, { pages: PAGE_LIST, csrfToken: CSRF_TOKEN, published: false });
    return;
  }
  if (req.method === "GET" && url.pathname === "/__editor/preview") {
    await servePreview(res, url);
    return;
  }
  if (req.method === "POST" && url.pathname === "/__editor/api/save") {
    if (!postIsSameOrigin(req)) {
      sendJson(res, 403, { ok: false, message: "The save request did not come from this local editor." });
      return;
    }
    if (!constantTimeEqual(req.headers["x-visual-copy-token"], CSRF_TOKEN)) {
      sendJson(res, 403, { ok: false, message: "The editor session expired. Reload the editor and try again." });
      return;
    }
    let payload;
    try {
      payload = await readRequestJson(req);
    } catch (error) {
      sendJson(res, error.statusCode || 400, { ok: false, message: error.message });
      return;
    }
    const task = saveQueue.then(() => performSave(payload));
    saveQueue = task.catch(() => {});
    try {
      sendJson(res, 200, await task);
    } catch (error) {
      const buildFailure = Boolean(error.buildStep);
      const rollbackFailed = error.rollbackConfirmed === false;
      const statusCode = rollbackFailed ? 500 : (error.statusCode || (buildFailure ? 422 : 500));
      const message = rollbackFailed
        ? "The save failed and automatic rollback could not be confirmed. Close the editor and have the local site checked before making another change."
        : buildFailure
          ? `Nothing was saved. ${error.buildStep} did not pass, and the prior files were restored.${error.safeDetail ? ` ${error.safeDetail}` : ""}`
          : safeErrorMessage(error.message);
      sendJson(res, statusCode, {
        ok: false,
        message,
        rolledBack: error.rollbackConfirmed === true,
        published: false,
      });
    }
    return;
  }
  if (req.method === "GET") {
    await serveStaticAsset(res, url.pathname);
    return;
  }
  res.writeHead(405, commonHeaders("text/plain; charset=utf-8", { Allow: "GET, POST" }));
  res.end("Method not allowed.\n");
}

function openEditor(url) {
  let command;
  let args;
  if (process.platform === "win32") {
    command = "cmd.exe";
    args = ["/d", "/s", "/c", "start", "", url];
  } else if (process.platform === "darwin") {
    command = "open";
    args = [url];
  } else {
    command = "xdg-open";
    args = [url];
  }
  const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true, shell: false });
  child.on("error", () => {});
  child.unref();
}

async function main() {
  activePort = parsePort(process.argv.slice(2));
  const server = createServer((req, res) => {
    routeRequest(req, res).catch(() => {
      if (!res.headersSent) {
        sendJson(res, 500, { ok: false, message: "The local editor encountered an unexpected error." });
      } else {
        res.end();
      }
    });
  });
  server.requestTimeout = 130_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 80;
  server.on("clientError", (_error, socket) => {
    if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(activePort, HOST, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const editorUrl = `http://${HOST}:${activePort}/__editor/`;
  process.stdout.write(`Visual Copy Editor is ready at ${editorUrl}\n`);
  process.stdout.write("Changes save locally, rebuild, and validate. Nothing is published.\n");
  if (process.argv.includes("--open")) openEditor(editorUrl);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || "The Visual Copy Editor could not start."}\n`);
  process.exitCode = 1;
});
