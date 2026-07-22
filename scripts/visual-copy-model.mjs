import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pages as registeredPages } from "./site-data.mjs";

export const COPY_SCHEMA_VERSION = 1;
export const PUBLIC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_REGISTRY_PATH = path.join(PUBLIC_ROOT, "content", "visual-copy.json");

const EDITABLE_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "p", "summary", "a", "button"]);
const ALLOWED_KINDS = new Set(["heading", "paragraph", "cta", "faq-question", "faq-answer", "footer"]);
const MAX_HTML_LENGTH = 20_000;
const MAX_TEXT_LENGTH = 5_000;

function sha256(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

function normalizePagePath(pagePath) {
  const normalized = String(pagePath || "index.html").replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalized || normalized === ".") return "index.html";
  if (normalized.includes("..") || !normalized.endsWith(".html")) throw new Error(`Unsafe page path: ${pagePath}`);
  return normalized;
}

function pageKeyFor(pagePath) {
  if (pagePath === "index.html") return "home";
  if (pagePath === "404.html") return "not-found";
  return pagePath
    .replace(/\/index\.html$/i, "")
    .split("/")
    .at(-1)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "page";
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeEntities(value) {
  const named = new Map([
    ["amp", "&"], ["lt", "<"], ["gt", ">"], ["quot", '"'], ["apos", "'"],
    ["nbsp", " "], ["rsquo", "’"], ["lsquo", "‘"], ["rdquo", "”"], ["ldquo", "“"],
    ["ndash", "–"], ["mdash", "—"], ["hellip", "…"],
  ]);
  return String(value).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, key) => {
    if (key[0] === "#") {
      const codePoint = key[1]?.toLowerCase() === "x"
        ? Number.parseInt(key.slice(2), 16)
        : Number.parseInt(key.slice(1), 10);
      try {
        return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
      } catch {
        return entity;
      }
    }
    return named.get(key.toLowerCase()) ?? entity;
  });
}

function visibleText(innerHtml) {
  let text = String(innerHtml);
  text = text.replace(/<([a-z][\w:-]*)\b(?=[^>]*(?:aria-hidden\s*=\s*["']true["']|class\s*=\s*["'][^"']*\bvisually-hidden\b[^"']*["']))[^>]*>[\s\S]*?<\/\1\s*>/gi, " ");
  text = text.replace(/<(?:svg|style|script|template)\b[^>]*>[\s\S]*?<\/(?:svg|style|script|template)\s*>/gi, " ");
  text = text.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ");
  return decodeEntities(text).replace(/\s+/g, " ").trim();
}

function htmlTagTokens(innerHtml) {
  return [...String(innerHtml).matchAll(/<[^>]+>/g)].map((match) => match[0]);
}

function protectedInlineFragments(innerHtml) {
  const fragments = [];
  const pattern = /<([a-z][\w:-]*)\b(?=[^>]*(?:aria-hidden\s*=\s*["']true["']|class\s*=\s*["'][^"']*\bvisually-hidden\b[^"']*["']))[^>]*>[\s\S]*?<\/\1\s*>|<svg\b[^>]*>[\s\S]*?<\/svg\s*>/gi;
  for (const match of String(innerHtml).matchAll(pattern)) fragments.push(match[0]);
  return fragments;
}

function elementRanges(html, tagName) {
  const ranges = [];
  const pattern = new RegExp(`<${tagName}\\b[^>]*>[\\s\\S]*?<\\/${tagName}\\s*>`, "gi");
  for (const match of html.matchAll(pattern)) ranges.push({ start: match.index, end: match.index + match[0].length });
  return ranges;
}

function insideRange(index, ranges) {
  return ranges.some((range) => index >= range.start && index < range.end);
}

function openingAttributes(openTag) {
  const attributes = new Map();
  for (const match of openTag.matchAll(/([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    const name = match[1].toLowerCase();
    if (name === openTag.match(/^<\/?\s*([:\w-]+)/)?.[1]?.toLowerCase()) continue;
    attributes.set(name, match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attributes;
}

function classTokens(attributes) {
  return new Set((attributes.get("class") || "").split(/\s+/).filter(Boolean));
}

function isHiddenElement(attributes) {
  const classes = classTokens(attributes);
  return attributes.has("hidden") || attributes.get("aria-hidden") === "true" || classes.has("visually-hidden");
}

function collectFaqPages(value, results = []) {
  if (!value || typeof value !== "object") return results;
  if (Array.isArray(value)) {
    for (const item of value) collectFaqPages(item, results);
    return results;
  }
  const type = value["@type"];
  if (type === "FAQPage" || (Array.isArray(type) && type.includes("FAQPage"))) results.push(value);
  for (const child of Object.values(value)) collectFaqPages(child, results);
  return results;
}

function jsonLdRecords(html) {
  const records = [];
  const pattern = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi;
  let scriptOrdinal = 0;
  for (const match of html.matchAll(pattern)) {
    try {
      const value = JSON.parse(match[1]);
      const faqPages = collectFaqPages(value);
      records.push({
        scriptOrdinal,
        start: match.index,
        end: match.index + match[0].length,
        innerStart: match.index + match[0].indexOf(match[1]),
        innerEnd: match.index + match[0].indexOf(match[1]) + match[1].length,
        value,
        faqPages,
      });
    } catch {
      records.push({ scriptOrdinal, start: match.index, end: match.index + match[0].length, value: null, faqPages: [] });
    }
    scriptOrdinal += 1;
  }
  return records;
}

function faqBindingsFor(html, entries) {
  const scripts = jsonLdRecords(html);
  const schemaEntities = [];
  for (const script of scripts) {
    for (let faqPageOrdinal = 0; faqPageOrdinal < script.faqPages.length; faqPageOrdinal += 1) {
      const entities = Array.isArray(script.faqPages[faqPageOrdinal]?.mainEntity)
        ? script.faqPages[faqPageOrdinal].mainEntity
        : [];
      entities.forEach((entity, entityOrdinal) => {
        if (typeof entity?.name === "string") {
          schemaEntities.push({ scriptOrdinal: script.scriptOrdinal, faqPageOrdinal, entityOrdinal, entity });
        }
      });
    }
  }
  const detailsRecords = [];
  const detailsPattern = /<details\b[^>]*>[\s\S]*?<\/details\s*>/gi;
  for (const details of html.matchAll(detailsPattern)) {
    const start = details.index;
    const end = start + details[0].length;
    const question = entries.find((entry) => entry.tag === "summary" && entry.openStart >= start && entry.openStart < end);
    const answer = entries.find((entry) => entry.tag === "p" && entry.openStart >= start && entry.openStart < end);
    if (question) detailsRecords.push({ question, answer });
  }

  const used = new Set();
  const bind = (record, located) => {
    const key = `${located.scriptOrdinal}:${located.faqPageOrdinal}:${located.entityOrdinal}`;
    used.add(key);
    record.question.schemaBindings = [{ scriptOrdinal: located.scriptOrdinal, faqPageOrdinal: located.faqPageOrdinal, entityOrdinal: located.entityOrdinal, field: "name" }];
    if (record.answer) record.answer.schemaBindings = [{ scriptOrdinal: located.scriptOrdinal, faqPageOrdinal: located.faqPageOrdinal, entityOrdinal: located.entityOrdinal, field: "acceptedAnswer.text" }];
  };

  for (const record of detailsRecords) {
    const exact = schemaEntities.find((candidate) => candidate.entity.name === record.question.sourceText);
    if (exact) bind(record, exact);
  }

  const words = (value) => new Set(String(value).toLowerCase().match(/[a-z0-9]+/g) || []);
  const similarity = (left, right) => {
    const a = words(left);
    const b = words(right);
    const intersection = [...a].filter((word) => b.has(word)).length;
    return intersection / Math.max(1, new Set([...a, ...b]).size);
  };
  for (const record of detailsRecords.filter(({ question }) => question.schemaBindings.length === 0)) {
    const candidates = schemaEntities
      .filter((candidate) => !used.has(`${candidate.scriptOrdinal}:${candidate.faqPageOrdinal}:${candidate.entityOrdinal}`))
      .map((candidate) => ({ candidate, score: similarity(record.question.sourceText, candidate.entity.name) }))
      .sort((a, b) => b.score - a.score);
    if (candidates[0]?.score >= 0.35) bind(record, candidates[0].candidate);
  }
}

function persistedEntry(entry, existingEntry = null) {
  const currentHash = sha256(entry.sourceHtml);
  if (existingEntry && (currentHash === existingEntry.sourceHash || currentHash === existingEntry.overrideHash)) {
    return {
      id: existingEntry.id,
      tag: existingEntry.tag,
      ordinal: existingEntry.ordinal,
      kind: existingEntry.kind,
      sourceHtml: existingEntry.sourceHtml,
      sourceText: existingEntry.sourceText,
      sourceHash: existingEntry.sourceHash,
      overrideHtml: existingEntry.overrideHtml ?? null,
      overrideHash: existingEntry.overrideHash ?? null,
      updatedAt: existingEntry.updatedAt ?? null,
      updatedBy: existingEntry.updatedBy ?? null,
      schemaBindings: existingEntry.schemaBindings?.length ? existingEntry.schemaBindings : entry.schemaBindings,
    };
  }
  return {
    id: entry.id,
    tag: entry.tag,
    ordinal: entry.ordinal,
    kind: entry.kind,
    sourceHtml: entry.sourceHtml,
    sourceText: entry.sourceText,
    sourceHash: entry.sourceHash,
    overrideHtml: null,
    overrideHash: null,
    updatedAt: null,
    updatedBy: null,
    schemaBindings: entry.schemaBindings,
  };
}

function fingerprint(entries) {
  return sha256(entries.map((entry) => `${entry.id}:${entry.sourceHash}:${entry.overrideHash || ""}`).join("\n"));
}

export function discoverEditableCopy(html, pagePath) {
  pagePath = normalizePagePath(pagePath);
  const pageKey = pageKeyFor(pagePath);
  const excludedRanges = [
    ...elementRanges(html, "script"),
    ...elementRanges(html, "style"),
    ...elementRanges(html, "template"),
    ...elementRanges(html, "header"),
  ];
  const footerRanges = elementRanges(html, "footer");
  const detailsRanges = elementRanges(html, "details");
  const ordinals = new Map();
  const entries = [];
  const pattern = /<(h[1-6]|p|summary|a|button)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi;

  for (const match of html.matchAll(pattern)) {
    const tag = match[1].toLowerCase();
    if (!EDITABLE_TAGS.has(tag) || insideRange(match.index, excludedRanges)) continue;
    const openTag = match[0].slice(0, match[0].indexOf(">") + 1);
    const attributes = openingAttributes(openTag);
    if (isHiddenElement(attributes)) continue;
    const inFooter = insideRange(match.index, footerRanges);
    const inDetails = insideRange(match.index, detailsRanges);
    const classes = classTokens(attributes);

    if (tag === "a" && !inFooter && !classes.has("button") && !classes.has("mobile-booking") && !classes.has("text-link")) continue;
    if (tag === "button" && !classes.has("button") && !classes.has("cta") && attributes.get("role") !== "button") continue;

    const innerHtml = match[3];
    const sourceText = visibleText(innerHtml);
    if (!sourceText) continue;
    const ordinal = (ordinals.get(tag) || 0) + 1;
    ordinals.set(tag, ordinal);
    let kind = "paragraph";
    if (/^h[1-6]$/.test(tag)) kind = "heading";
    else if (tag === "summary") kind = "faq-question";
    else if (tag === "p" && inDetails) kind = "faq-answer";
    else if (inFooter) kind = "footer";
    else if (tag === "a" || tag === "button") kind = "cta";

    const innerOffset = match[0].indexOf(innerHtml, openTag.length);
    entries.push({
      id: `${pageKey}--${tag}-${String(ordinal).padStart(3, "0")}`,
      tag,
      ordinal,
      kind,
      sourceHtml: innerHtml,
      sourceText,
      sourceHash: sha256(innerHtml),
      overrideHtml: null,
      overrideHash: null,
      updatedAt: null,
      updatedBy: null,
      schemaBindings: [],
      openStart: match.index,
      openEnd: match.index + openTag.length,
      innerStart: match.index + innerOffset,
      innerEnd: match.index + innerOffset + innerHtml.length,
    });
  }

  faqBindingsFor(html, entries);
  return { page: pagePath, pageKey, entries };
}

export async function listPublicHtmlFiles(rootDir = PUBLIC_ROOT) {
  const files = [...registeredPages.map((page) => page.file), "404.html"];
  const unique = [...new Set(files.map(normalizePagePath))];
  for (const file of unique) {
    const fileStat = await stat(path.join(rootDir, ...file.split("/"))).catch(() => null);
    if (!fileStat?.isFile()) throw new Error(`Missing public HTML page: ${file}`);
  }
  return unique;
}

export async function buildCopyRegistry(rootDir = PUBLIC_ROOT, existingRegistry = null, { pageFiles } = {}) {
  pageFiles = pageFiles ?? await listPublicHtmlFiles(rootDir);
  const existingPages = new Map((existingRegistry?.pages || []).map((page) => [page.path, page]));
  const registryPages = [];
  for (const pagePath of pageFiles) {
    const html = await readFile(path.join(rootDir, ...normalizePagePath(pagePath).split("/")), "utf8");
    const discovered = discoverEditableCopy(html, pagePath);
    const existingEntries = new Map((existingPages.get(discovered.page)?.entries || []).map((entry) => [entry.id, entry]));
    const entries = discovered.entries.map((entry) => persistedEntry(entry, existingEntries.get(entry.id)));
    registryPages.push({ path: discovered.page, pageKey: discovered.pageKey, copyFingerprint: fingerprint(entries), entries });
  }
  return { schemaVersion: COPY_SCHEMA_VERSION, generatedAt: new Date().toISOString(), pages: registryPages };
}

function registryPage(registry, pagePath) {
  pagePath = normalizePagePath(pagePath);
  return registry?.pages?.find((page) => page.path === pagePath) ?? null;
}

function applySchemaBindings(html, page) {
  const updates = [];
  for (const entry of page.entries) {
    if (!entry.schemaBindings?.length) continue;
    const replacement = entry.overrideHtml ?? entry.sourceHtml;
    const text = visibleText(replacement);
    for (const binding of entry.schemaBindings) updates.push({ ...binding, text });
  }
  if (!updates.length) return html;

  const scripts = jsonLdRecords(html);
  for (const update of updates) {
    const script = scripts.find((item) => item.scriptOrdinal === update.scriptOrdinal);
    const faqPage = script?.faqPages?.[update.faqPageOrdinal];
    const entity = Array.isArray(faqPage?.mainEntity) ? faqPage.mainEntity[update.entityOrdinal] : null;
    if (!script?.value || !entity) throw new Error(`Broken FAQ schema binding in ${page.path}`);
    if (update.field === "name") entity.name = update.text;
    else if (update.field === "acceptedAnswer.text") {
      if (!entity.acceptedAnswer || typeof entity.acceptedAnswer !== "object") throw new Error(`Broken FAQ answer binding in ${page.path}`);
      entity.acceptedAnswer.text = update.text;
    }
  }

  for (const script of scripts.sort((a, b) => b.innerStart - a.innerStart)) {
    if (!script.value || !updates.some((update) => update.scriptOrdinal === script.scriptOrdinal)) continue;
    const rendered = `\n${JSON.stringify(script.value, null, 8)}\n`;
    html = `${html.slice(0, script.innerStart)}${rendered}${html.slice(script.innerEnd)}`;
  }
  return html;
}

export function assertSafeCopyHtml(sourceHtml, replacementHtml) {
  if (typeof sourceHtml !== "string" || typeof replacementHtml !== "string") throw new Error("Copy HTML must be text.");
  if (replacementHtml.length > MAX_HTML_LENGTH) throw new Error(`Copy field exceeds ${MAX_HTML_LENGTH} characters.`);
  const text = visibleText(replacementHtml);
  if (!text) throw new Error("Copy cannot be empty.");
  if (text.length > MAX_TEXT_LENGTH) throw new Error(`Visible copy exceeds ${MAX_TEXT_LENGTH} characters.`);
  const sourceTags = htmlTagTokens(sourceHtml);
  const replacementTags = htmlTagTokens(replacementHtml);
  if (sourceTags.length !== replacementTags.length || sourceTags.some((tag, index) => tag !== replacementTags[index])) {
    throw new Error("Copy-only edits must preserve every link, icon, span, and attribute.");
  }
  const protectedSource = protectedInlineFragments(sourceHtml);
  const protectedReplacement = protectedInlineFragments(replacementHtml);
  if (
    protectedSource.length !== protectedReplacement.length ||
    protectedSource.some((fragment, index) => fragment !== protectedReplacement[index])
  ) {
    throw new Error("Hidden accessibility text and icons cannot be changed in the copy editor.");
  }
  if (/<\s*(?:script|style|iframe|object|embed|form|input|textarea|select|meta|link)\b/i.test(replacementHtml) && sourceTags.length === 0) {
    throw new Error("Executable or form markup is not allowed in copy.");
  }
  return true;
}

export function applyCopyOverrides(html, pagePath, registry, { instrument = false, strict = true } = {}) {
  const page = registryPage(registry, pagePath);
  if (!page) {
    if (strict) throw new Error(`Copy registry is missing page: ${pagePath}`);
    return html;
  }
  const discovered = discoverEditableCopy(html, pagePath);
  const currentById = new Map(discovered.entries.map((entry) => [entry.id, entry]));
  const replacements = [];
  for (const entry of page.entries) {
    const current = currentById.get(entry.id);
    if (!current) {
      if (strict) throw new Error(`Copy field is missing from ${page.path}: ${entry.id}`);
      continue;
    }
    const currentHash = sha256(current.sourceHtml);
    if (strict && currentHash !== entry.sourceHash && currentHash !== entry.overrideHash) {
      throw new Error(`Unmanaged copy drift in ${page.path}: ${entry.id}`);
    }
    const desired = entry.overrideHtml ?? entry.sourceHtml;
    assertSafeCopyHtml(entry.sourceHtml, desired);
    replacements.push({ start: current.innerStart, end: current.innerEnd, value: desired });
  }
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    html = `${html.slice(0, replacement.start)}${replacement.value}${html.slice(replacement.end)}`;
  }
  html = applySchemaBindings(html, page);
  return instrument ? instrumentHtml(html, pagePath, registry, { strict }) : html;
}

function escapeAttribute(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function instrumentHtml(html, pagePath, registry = null, { strict = true } = {}) {
  if (!registry) throw new Error("A copy registry is required to instrument a preview.");
  const page = registryPage(registry, pagePath);
  if (!page) throw new Error(`Copy registry is missing page: ${pagePath}`);
  const discovered = discoverEditableCopy(html, pagePath);
  const currentById = new Map(discovered.entries.map((entry) => [entry.id, entry]));
  const insertions = [];
  for (const entry of page.entries) {
    const current = currentById.get(entry.id);
    if (!current) {
      if (strict) throw new Error(`Copy field is missing from ${page.path}: ${entry.id}`);
      continue;
    }
    const currentHash = sha256(current.sourceHtml);
    const state = currentHash === entry.overrideHash ? "overridden" : "source";
    if (strict && currentHash !== entry.sourceHash && currentHash !== entry.overrideHash) throw new Error(`Unmanaged copy drift in ${page.path}: ${entry.id}`);
    const attributes = ` data-copy-id="${escapeAttribute(entry.id)}" data-copy-kind="${escapeAttribute(entry.kind)}" data-copy-source-hash="${entry.sourceHash}" data-copy-state="${state}"`;
    insertions.push({ index: current.openEnd - 1, value: attributes });
  }
  for (const insertion of insertions.sort((a, b) => b.index - a.index)) {
    html = `${html.slice(0, insertion.index)}${insertion.value}${html.slice(insertion.index)}`;
  }
  return html;
}

function cloneRegistry(registry) {
  return structuredClone(registry);
}

function refreshRegistry(registry) {
  registry.generatedAt = new Date().toISOString();
  for (const page of registry.pages) page.copyFingerprint = fingerprint(page.entries);
  return registry;
}

export function setCopyOverride(registry, copyId, replacementHtml, { expectedSourceHash, updatedAt, updatedBy } = {}) {
  const next = cloneRegistry(registry);
  let target = null;
  for (const page of next.pages || []) {
    const entry = page.entries?.find((candidate) => candidate.id === copyId);
    if (entry) {
      if (target) throw new Error(`Duplicate copy id: ${copyId}`);
      target = entry;
    }
  }
  if (!target) throw new Error(`Unknown copy id: ${copyId}`);
  if (expectedSourceHash && expectedSourceHash !== target.sourceHash) throw new Error(`Source revision changed for ${copyId}`);
  assertSafeCopyHtml(target.sourceHtml, replacementHtml);
  if (replacementHtml === target.sourceHtml) {
    target.overrideHtml = null;
    target.overrideHash = null;
    target.updatedAt = null;
    target.updatedBy = null;
  } else {
    target.overrideHtml = replacementHtml;
    target.overrideHash = sha256(replacementHtml);
    target.updatedAt = updatedAt || new Date().toISOString();
    target.updatedBy = updatedBy || "Visual Copy Editor";
  }
  return refreshRegistry(next);
}

export function clearCopyOverride(registry, copyId) {
  const page = registry?.pages?.find((candidate) => candidate.entries?.some((entry) => entry.id === copyId));
  const entry = page?.entries?.find((candidate) => candidate.id === copyId);
  if (!entry) throw new Error(`Unknown copy id: ${copyId}`);
  return setCopyOverride(registry, copyId, entry.sourceHtml, { expectedSourceHash: entry.sourceHash });
}

export async function loadCopyRegistry(registryPath = DEFAULT_REGISTRY_PATH) {
  const text = await readFile(registryPath, "utf8");
  return JSON.parse(text);
}

export function effectiveContentModifiedOn(registry, pagePath, fallbackDate) {
  const page = registryPage(registry, pagePath);
  let effective = String(fallbackDate || "");
  for (const entry of page?.entries || []) {
    const date = typeof entry.updatedAt === "string" ? entry.updatedAt.slice(0, 10) : "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && date > effective) effective = date;
  }
  return effective;
}

export async function validateCopyRegistry(registry, { rootDir = PUBLIC_ROOT, pageFiles, requireAllPages = true, requireApplied = false } = {}) {
  const errors = [];
  const warnings = [];
  const allowedPages = pageFiles ?? await listPublicHtmlFiles(rootDir);
  const allowedPageSet = new Set(allowedPages);
  const ids = new Set();
  let entryCount = 0;
  let overrideCount = 0;

  if (registry?.schemaVersion !== COPY_SCHEMA_VERSION) errors.push(`Unsupported visual-copy schema version: ${registry?.schemaVersion}`);
  if (!Array.isArray(registry?.pages)) errors.push("Visual-copy registry is missing pages.");
  const registryPaths = new Set((registry?.pages || []).map((page) => page.path));
  if (requireAllPages) {
    for (const pagePath of allowedPages) if (!registryPaths.has(pagePath)) errors.push(`Visual-copy registry is missing page: ${pagePath}`);
  }

  for (const page of registry?.pages || []) {
    if (!allowedPageSet.has(page.path)) errors.push(`Visual-copy registry contains an unapproved page: ${page.path}`);
    if (!Array.isArray(page.entries)) {
      errors.push(`Visual-copy page has no entries array: ${page.path}`);
      continue;
    }
    const html = await readFile(path.join(rootDir, ...normalizePagePath(page.path).split("/")), "utf8").catch(() => null);
    if (html == null) {
      errors.push(`Visual-copy page file is missing: ${page.path}`);
      continue;
    }
    const current = discoverEditableCopy(html, page.path);
    const currentById = new Map(current.entries.map((entry) => [entry.id, entry]));
    const registeredIds = new Set(page.entries.map((entry) => entry.id));
    if (current.entries.length !== page.entries.length) {
      errors.push(`Editable field count drift in ${page.path}: expected ${page.entries.length}, found ${current.entries.length}`);
    }
    for (const liveEntry of current.entries) {
      if (!registeredIds.has(liveEntry.id)) errors.push(`Unregistered editable copy in ${page.path}: ${liveEntry.id}`);
    }
    const liveScripts = jsonLdRecords(html);
    const boundQuestions = new Set();
    for (const entry of page.entries) {
      entryCount += 1;
      if (!/^[a-z0-9][a-z0-9-]*--(?:h[1-6]|p|summary|a|button)-\d{3}$/.test(entry.id || "")) errors.push(`Unsafe visual-copy id: ${entry.id}`);
      if (ids.has(entry.id)) errors.push(`Duplicate visual-copy id: ${entry.id}`);
      ids.add(entry.id);
      if (!EDITABLE_TAGS.has(entry.tag)) errors.push(`Unsupported copy tag ${entry.tag}: ${entry.id}`);
      if (!ALLOWED_KINDS.has(entry.kind)) errors.push(`Unsupported copy kind ${entry.kind}: ${entry.id}`);
      if (sha256(entry.sourceHtml || "") !== entry.sourceHash) errors.push(`Source hash mismatch: ${entry.id}`);
      if (!visibleText(entry.sourceHtml || "")) errors.push(`Source copy is empty: ${entry.id}`);
      if (entry.overrideHtml != null) {
        overrideCount += 1;
        try { assertSafeCopyHtml(entry.sourceHtml, entry.overrideHtml); } catch (error) { errors.push(`${entry.id}: ${error.message}`); }
        if (sha256(entry.overrideHtml) !== entry.overrideHash) errors.push(`Override hash mismatch: ${entry.id}`);
      } else if (entry.overrideHash != null) {
        errors.push(`Override hash exists without override copy: ${entry.id}`);
      }
      const live = currentById.get(entry.id);
      if (!live) {
        errors.push(`Registered copy field is missing from ${page.path}: ${entry.id}`);
        continue;
      }
      const liveHash = sha256(live.sourceHtml);
      if (liveHash !== entry.sourceHash && liveHash !== entry.overrideHash) errors.push(`Unmanaged copy drift in ${page.path}: ${entry.id}`);
      const desiredHash = entry.overrideHash ?? entry.sourceHash;
      if (requireApplied && liveHash !== desiredHash) errors.push(`Governed copy is not applied in ${page.path}: ${entry.id}`);
      for (const binding of entry.schemaBindings || []) {
        const script = liveScripts.find((item) => item.scriptOrdinal === binding.scriptOrdinal);
        const faqPage = script?.faqPages?.[binding.faqPageOrdinal];
        const entity = Array.isArray(faqPage?.mainEntity) ? faqPage.mainEntity[binding.entityOrdinal] : null;
        if (!entity) {
          errors.push(`Broken FAQ schema binding in ${page.path}: ${entry.id}`);
          continue;
        }
        const key = `${binding.scriptOrdinal}:${binding.faqPageOrdinal}:${binding.entityOrdinal}`;
        if (binding.field === "name") boundQuestions.add(key);
        const schemaText = binding.field === "name"
          ? entity.name
          : binding.field === "acceptedAnswer.text"
            ? entity.acceptedAnswer?.text
            : undefined;
        if (schemaText === undefined) {
          errors.push(`Unsupported FAQ schema field in ${page.path}: ${entry.id}/${binding.field}`);
        } else if (requireApplied && schemaText !== visibleText(entry.overrideHtml ?? entry.sourceHtml)) {
          errors.push(`Visible FAQ copy and JSON-LD disagree in ${page.path}: ${entry.id}`);
        }
      }
    }
    if (page.copyFingerprint !== fingerprint(page.entries)) errors.push(`Page copy fingerprint mismatch: ${page.path}`);
    const schemaQuestionCount = liveScripts.reduce(
      (count, script) => count + script.faqPages.reduce(
        (innerCount, faqPage) => innerCount + (Array.isArray(faqPage?.mainEntity) ? faqPage.mainEntity.length : 0),
        0,
      ),
      0,
    );
    if (boundQuestions.size !== schemaQuestionCount) {
      errors.push(`FAQ schema bindings cover ${boundQuestions.size} of ${schemaQuestionCount} questions in ${page.path}`);
    }
  }

  const footerGroups = new Map();
  for (const page of registry?.pages || []) {
    for (const entry of page.entries || []) {
      if (entry.kind !== "footer") continue;
      const key = `${entry.tag}\0${entry.sourceText}`;
      const group = footerGroups.get(key) || [];
      group.push({ page: page.path, entry });
      footerGroups.set(key, group);
    }
  }
  for (const [key, group] of footerGroups) {
    if (group.length !== allowedPages.length) errors.push(`Shared footer field does not cover all ${allowedPages.length} pages: ${key.split("\0")[1]}`);
    const overrides = new Set(group.map(({ entry }) => entry.overrideHtml ?? ""));
    if (overrides.size > 1) errors.push(`Shared footer copy is inconsistent across pages: ${key.split("\0")[1]}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: { pages: registry?.pages?.length || 0, entries: entryCount, overrides: overrideCount },
  };
}

export async function saveCopyRegistry(registry, registryPath = DEFAULT_REGISTRY_PATH, { rootDir = PUBLIC_ROOT, validate = true } = {}) {
  if (validate) {
    const result = await validateCopyRegistry(registry, { rootDir });
    if (!result.valid) throw new Error(`Visual-copy registry is invalid:\n${result.errors.join("\n")}`);
  }
  await mkdir(path.dirname(registryPath), { recursive: true });
  const tempPath = `${registryPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(tempPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
    await rename(tempPath, registryPath);
  } catch (error) {
    await unlink(tempPath).catch(() => {});
    throw error;
  }
}
