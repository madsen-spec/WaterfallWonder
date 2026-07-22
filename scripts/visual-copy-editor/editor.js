const MESSAGE_SOURCE = "visual-copy-editor";
const MESSAGE_VERSION = 1;
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

const VIEWPORTS = Object.freeze({
  desktop: { width: 1440, height: 900, label: "Desktop" },
  tablet: { width: 768, height: 1024, label: "Tablet" },
  mobile: { width: 390, height: 844, label: "Mobile" },
});

const state = {
  pages: [],
  currentPage: "",
  csrfToken: "",
  viewport: "desktop",
  selectedId: "",
  drafts: new Map(),
  busy: false,
  expectedPreviewUrl: "",
};

const elements = {};

function cacheElements() {
  elements.pageSelect = document.querySelector("#page-select");
  elements.viewportButtons = [...document.querySelectorAll("[data-viewport]")];
  elements.viewportReadout = document.querySelector("#viewport-readout");
  elements.previewStage = document.querySelector("#preview-stage");
  elements.viewportScaler = document.querySelector("#viewport-scaler");
  elements.preview = document.querySelector("#page-preview");
  elements.previewLoading = document.querySelector("#preview-loading");
  elements.status = document.querySelector("#editor-status");
  elements.statusMessage = document.querySelector("#status-message");
  elements.draftCount = document.querySelector("#draft-count");
  elements.reloadButton = document.querySelector("#reload-button");
  elements.revertButton = document.querySelector("#revert-button");
  elements.saveButton = document.querySelector("#save-button");
  elements.emptyInspector = document.querySelector("#empty-inspector");
  elements.selectionInspector = document.querySelector("#selection-inspector");
  elements.selectionState = document.querySelector("#selection-state");
  elements.selectionKind = document.querySelector("#selection-kind");
  elements.selectionRevision = document.querySelector("#selection-revision");
  elements.selectionWords = document.querySelector("#selection-words");
  elements.selectionText = document.querySelector("#selection-text");
  elements.validationDetails = document.querySelector("#validation-details");
  elements.validationOutput = document.querySelector("#validation-output");
}

function bindEvents() {
  elements.pageSelect.addEventListener("change", handlePageChange);
  elements.viewportButtons.forEach((button) => {
    button.addEventListener("click", () => setViewport(button.dataset.viewport));
  });
  elements.reloadButton.addEventListener("click", reloadPreview);
  elements.revertButton.addEventListener("click", revertSelected);
  elements.saveButton.addEventListener("click", saveChanges);
  elements.preview.addEventListener("load", () => {
    if (!previewLocationIsAllowed()) {
      elements.previewLoading.hidden = false;
      setStatus("Navigation was contained and the editing preview was restored.", "ready");
      elements.preview.src = state.expectedPreviewUrl;
      return;
    }
    window.setTimeout(() => {
      if (!elements.previewLoading.hidden) {
        elements.previewLoading.hidden = true;
        setStatus("Preview loaded. Click highlighted text to edit it.", "ready");
      }
    }, 250);
  });
  window.addEventListener("message", handleBridgeMessage);
  window.addEventListener("beforeunload", (event) => {
    if (dirtyDrafts().length > 0) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      saveChanges();
    }
    if (event.key === "Escape" && state.selectedId) {
      event.preventDefault();
      revertSelected();
    }
  });

  const resizeObserver = new ResizeObserver(updatePreviewScale);
  resizeObserver.observe(elements.previewStage);
}

async function loadPages() {
  setStatus("Loading the governed pages…", "working");
  try {
    const response = await fetch("/__editor/api/pages", {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
      cache: "no-store",
    });
    const payload = await readJsonResponse(response);
    if (!response.ok || !Array.isArray(payload.pages)) {
      throw new Error(payload.message || "The page list could not be loaded.");
    }

    state.pages = payload.pages.filter(
      (page) => page && typeof page.file === "string" && typeof page.label === "string",
    );
    state.csrfToken = typeof payload.csrfToken === "string" ? payload.csrfToken : "";

    if (!state.pages.length || !state.csrfToken) {
      throw new Error("The editor server returned an incomplete page list.");
    }

    renderPageOptions();
    const requestedPage = new URLSearchParams(window.location.search).get("page");
    const initialPage = state.pages.some((page) => page.file === requestedPage)
      ? requestedPage
      : state.pages[0].file;
    elements.pageSelect.value = initialPage;
    elements.pageSelect.disabled = false;
    loadPreview(initialPage);
  } catch (error) {
    elements.previewLoading.hidden = true;
    setStatus(error.message || "The editor could not start.", "error");
  }
}

function renderPageOptions() {
  const fragment = document.createDocumentFragment();
  for (const page of state.pages) {
    const option = document.createElement("option");
    option.value = page.file;
    option.textContent = page.label;
    fragment.append(option);
  }
  elements.pageSelect.replaceChildren(fragment);
}

function handlePageChange(event) {
  const nextPage = event.target.value;
  if (dirtyDrafts().length > 0) {
    const shouldDiscard = window.confirm(
      "This page has unsaved copy changes. Discard them and open another page?",
    );
    if (!shouldDiscard) {
      elements.pageSelect.value = state.currentPage;
      return;
    }
  }
  loadPreview(nextPage);
}

function loadPreview(page) {
  state.currentPage = page;
  state.selectedId = "";
  state.drafts.clear();
  updateEditorState();
  updateInspector();
  elements.previewLoading.hidden = false;
  setStatus("Preparing the selected page…", "working");

  const previewUrl = new URL("/__editor/preview", window.location.origin);
  previewUrl.searchParams.set("path", page);
  previewUrl.searchParams.set("editor", String(Date.now()));
  elements.preview.title = `${pageLabel(page)} website preview`;
  state.expectedPreviewUrl = previewUrl.toString();
  elements.preview.src = state.expectedPreviewUrl;

  const url = new URL(window.location.href);
  url.searchParams.set("page", page);
  window.history.replaceState({}, "", url);
}

function reloadPreview() {
  if (!state.currentPage || state.busy) return;
  if (dirtyDrafts().length > 0) {
    const shouldDiscard = window.confirm(
      "Reloading will discard every unsaved change on this page. Continue?",
    );
    if (!shouldDiscard) return;
  }
  loadPreview(state.currentPage);
}

function setViewport(name) {
  if (!VIEWPORTS[name]) return;
  state.viewport = name;
  const preset = VIEWPORTS[name];
  elements.preview.width = String(preset.width);
  elements.preview.height = String(preset.height);
  elements.preview.style.width = `${preset.width}px`;
  elements.preview.style.height = `${preset.height}px`;
  elements.viewportReadout.value = `${preset.width} × ${preset.height}`;
  elements.viewportReadout.textContent = `${preset.width} × ${preset.height}`;
  elements.viewportButtons.forEach((button) => {
    const active = button.dataset.viewport === name;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  updatePreviewScale();
  setStatus(`${preset.label} preview: ${preset.width} pixels wide.`, "ready");
}

function updatePreviewScale() {
  const preset = VIEWPORTS[state.viewport];
  const availableWidth = Math.max(280, elements.previewStage.clientWidth - 48);
  const scale = Math.min(1, availableWidth / preset.width);
  elements.preview.style.transform = `scale(${scale})`;
  elements.viewportScaler.style.width = `${Math.round(preset.width * scale)}px`;
  elements.viewportScaler.style.height = `${Math.round(preset.height * scale)}px`;
}

function handleBridgeMessage(event) {
  if (
    event.origin !== window.location.origin ||
    event.source !== elements.preview.contentWindow ||
    !event.data ||
    event.data.source !== MESSAGE_SOURCE ||
    event.data.version !== MESSAGE_VERSION
  ) {
    return;
  }

  const { type, payload = {} } = event.data;
  if (type === "vce:ready") {
    elements.previewLoading.hidden = true;
    const count = Number(payload.editableCount) || 0;
    setStatus(
      count
        ? `${count} editable copy fields are ready. Click one to begin.`
        : "This page has no editable copy fields.",
      count ? "ready" : "error",
    );
    return;
  }

  if (type === "vce:select") {
    selectDraft(payload);
    return;
  }

  if (type === "vce:draft") {
    updateDraft(payload);
    return;
  }

  if (type === "vce:reset") {
    acceptBridgeReset(payload);
    return;
  }

  if (type === "vce:save-request") {
    saveChanges();
    return;
  }

  if (type === "vce:notice" && typeof payload.message === "string") {
    setStatus(payload.message, payload.tone === "error" ? "error" : "ready");
  }
}

function selectDraft(payload) {
  if (!validCopyPayload(payload)) return;
  let draft = state.drafts.get(payload.copyId);
  if (!draft) {
    draft = {
      copyId: payload.copyId,
      kind: cleanLabel(payload.kind || payload.tagName || "Copy"),
      tagName: payload.tagName || "",
      revision: String(payload.revision ?? "—"),
      savedHtml: payload.html,
      currentHtml: payload.html,
      text: payload.text || htmlToText(payload.html),
    };
    state.drafts.set(payload.copyId, draft);
  } else {
    draft.kind = cleanLabel(payload.kind || draft.kind);
    draft.tagName = payload.tagName || draft.tagName;
    draft.text = htmlToText(draft.currentHtml);
  }
  state.selectedId = payload.copyId;
  updateInspector();
  updateEditorState();
  const sharedFooter = draft.kind.toLowerCase() === "footer";
  setStatus(
    draft.currentHtml === draft.savedHtml
      ? sharedFooter
        ? "Editing shared footer copy. Saving it will update all 14 pages."
        : `Editing ${draft.kind.toLowerCase()}. Type directly in the page.`
      : sharedFooter
        ? "This shared footer change will update all 14 pages when saved."
        : "This field has an unsaved change.",
    draft.currentHtml === draft.savedHtml ? "ready" : "draft",
  );
}

function updateDraft(payload) {
  if (!validCopyPayload(payload)) return;
  let draft = state.drafts.get(payload.copyId);
  if (!draft) {
    draft = {
      copyId: payload.copyId,
      kind: cleanLabel(payload.kind || payload.tagName || "Copy"),
      tagName: payload.tagName || "",
      revision: String(payload.revision ?? "—"),
      savedHtml: typeof payload.originalHtml === "string" ? payload.originalHtml : payload.html,
      currentHtml: payload.html,
      text: payload.text || htmlToText(payload.html),
    };
    state.drafts.set(payload.copyId, draft);
  } else {
    draft.currentHtml = payload.html;
    draft.text = payload.text || htmlToText(payload.html);
  }
  state.selectedId = payload.copyId;
  updateInspector();
  updateEditorState();
  const count = dirtyDrafts().length;
  setStatus(
    draft.kind.toLowerCase() === "footer"
      ? `${count} unsaved ${count === 1 ? "change" : "changes"}. Shared footer wording will update all 14 pages.`
      : `${count} unsaved ${count === 1 ? "change" : "changes"}. Save when the page reads the way you want.`,
    "draft",
  );
}

function acceptBridgeReset(payload) {
  if (!payload || typeof payload.copyId !== "string") return;
  const draft = state.drafts.get(payload.copyId);
  if (!draft) return;
  draft.currentHtml = draft.savedHtml;
  draft.text = htmlToText(draft.savedHtml);
  state.selectedId = payload.copyId;
  updateInspector();
  updateEditorState();
  setStatus("Selected copy restored to its last saved version.", "ready");
}

function revertSelected() {
  if (!state.selectedId || state.busy) return;
  const draft = state.drafts.get(state.selectedId);
  if (!draft) return;
  draft.currentHtml = draft.savedHtml;
  draft.text = htmlToText(draft.savedHtml);
  postToPreview("vce:reset", {
    copyId: draft.copyId,
    html: draft.savedHtml,
    revision: draft.revision,
  });
  updateInspector();
  updateEditorState();
  setStatus("Selected copy restored to its last saved version.", "ready");
}

async function saveChanges() {
  const pending = dirtyDrafts();
  if (!pending.length || state.busy) return;
  state.busy = true;
  updateEditorState();
  elements.preview.classList.add("is-saving");
  elements.status.setAttribute("tabindex", "-1");
  elements.status.focus({ preventScroll: true });
  setStatus(
    `Saving ${pending.length} ${pending.length === 1 ? "change" : "changes"}, rebuilding, and checking the site…`,
    "working",
  );

  let responsePayload = null;
  try {
    const response = await fetch("/__editor/api/save", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Visual-Copy-Token": state.csrfToken,
      },
      body: JSON.stringify({
        page: state.currentPage,
        changes: pending.map((draft) => ({
          copyId: draft.copyId,
          html: draft.currentHtml,
          revision: draft.revision,
        })),
        csrfToken: state.csrfToken,
      }),
    });
    const payload = await readJsonResponse(response);
    responsePayload = payload;
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.message || "The changes could not be saved.");
    }

    if (!Array.isArray(payload.changes)) {
      throw new Error("The editor did not confirm the saved changes.");
    }

    const confirmedById = new Map(payload.changes.map((change) => [change?.copyId, change]));
    const confirmed = await Promise.all(
      pending.map(async (draft) => {
        const result = confirmedById.get(draft.copyId);
        if (!result) {
          throw new Error(`The editor did not confirm “${draft.kind}”.`);
        }
        const savedHtml = pickString(result.html, draft.currentHtml);
        let revision = pickString(result.revision);
        if (!revision) revision = await sha256Hex(savedHtml);
        if (!revision) throw new Error("The editor did not return a revision hash.");
        return { draft, savedHtml, revision };
      }),
    );

    if (typeof payload.csrfToken === "string" && payload.csrfToken) {
      state.csrfToken = payload.csrfToken;
    }

    for (const { draft, savedHtml, revision } of confirmed) {
      draft.savedHtml = savedHtml;
      draft.currentHtml = savedHtml;
      draft.text = htmlToText(savedHtml);
      draft.revision = revision;
      postToPreview("vce:save-complete", {
        copyId: draft.copyId,
        html: savedHtml,
        revision,
      });
    }

    renderValidation(payload.validation);

    updateInspector();
    const serverMessage = pickString(payload.message);
    setStatus(
      serverMessage ||
        `${confirmed.length} ${confirmed.length === 1 ? "change was" : "changes were"} saved together. The rebuilt site passed its checks.`,
      "success",
    );
  } catch (error) {
    if (responsePayload?.validation) renderValidation(responsePayload.validation);
    setStatus(error.message || "Nothing was saved. Review the issue and try again.", "error");
  } finally {
    state.busy = false;
    elements.preview.classList.remove("is-saving");
    updateEditorState();
  }
}

function renderValidation(validation) {
  if (validation == null) return;
  let text = "";
  if (typeof validation === "string") {
    text = validation;
  } else if (typeof validation.summary === "string") {
    text = validation.summary;
    const details = { ...validation };
    delete details.summary;
    if (Object.keys(details).length) {
      text += `\n\n${JSON.stringify(details, null, 2)}`;
    }
  } else {
    text = JSON.stringify(validation, null, 2);
  }
  elements.validationOutput.textContent = text;
  elements.validationDetails.hidden = false;
}

function updateEditorState() {
  const pending = dirtyDrafts();
  const selected = state.drafts.get(state.selectedId);
  elements.saveButton.disabled = state.busy || pending.length === 0;
  elements.saveButton.textContent = state.busy
    ? "Checking site…"
    : pending.length > 1
      ? `Save ${pending.length} changes`
      : "Save changes";
  elements.revertButton.disabled = state.busy || !selected || selected.currentHtml === selected.savedHtml;
  elements.reloadButton.disabled = state.busy || !state.currentPage;
  elements.pageSelect.disabled = state.busy || state.pages.length === 0;

  elements.draftCount.hidden = pending.length === 0;
  elements.draftCount.textContent = `${pending.length} unsaved`;
}

function updateInspector() {
  const draft = state.drafts.get(state.selectedId);
  const hasSelection = Boolean(draft);
  elements.emptyInspector.hidden = hasSelection;
  elements.selectionInspector.hidden = !hasSelection;
  if (!hasSelection) {
    elements.selectionState.textContent = "None";
    elements.selectionState.classList.remove("is-dirty");
    return;
  }

  const dirty = draft.currentHtml !== draft.savedHtml;
  const text = htmlToText(draft.currentHtml);
  elements.selectionState.textContent = dirty ? "Unsaved" : "Selected";
  elements.selectionState.classList.toggle("is-dirty", dirty);
  elements.selectionKind.textContent = draft.kind;
  elements.selectionRevision.textContent = draft.revision;
  elements.selectionWords.textContent = String(wordCount(text));
  elements.selectionText.textContent = text || "(Empty copy)";
}

function postToPreview(type, payload = {}) {
  if (!elements.preview.contentWindow) return;
  elements.preview.contentWindow.postMessage(
    { source: MESSAGE_SOURCE, version: MESSAGE_VERSION, type, payload },
    window.location.origin,
  );
}

function setStatus(message, tone = "ready") {
  elements.status.dataset.tone = tone;
  elements.statusMessage.textContent = message;
}

function dirtyDrafts() {
  return [...state.drafts.values()].filter((draft) => draft.currentHtml !== draft.savedHtml);
}

function validCopyPayload(payload) {
  return Boolean(
    payload &&
      typeof payload.copyId === "string" &&
      payload.copyId &&
      typeof payload.html === "string",
  );
}

function htmlToText(html) {
  const container = document.createElement("div");
  container.innerHTML = html;
  return (container.textContent || "").replace(/\s+/g, " ").trim();
}

function wordCount(text) {
  const words = text.trim().match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu);
  return words ? words.length : 0;
}

function cleanLabel(value) {
  return String(value)
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function pageLabel(file) {
  return state.pages.find((page) => page.file === file)?.label || file;
}

function previewLocationIsAllowed() {
  if (!state.expectedPreviewUrl) return true;
  try {
    const current = new URL(elements.preview.contentWindow.location.href);
    const expected = new URL(state.expectedPreviewUrl);
    return (
      current.origin === window.location.origin &&
      current.pathname === expected.pathname &&
      current.searchParams.get("path") === state.currentPage
    );
  } catch {
    return false;
  }
}

async function sha256Hex(value) {
  if (!window.crypto?.subtle) return "";
  const bytes = new TextEncoder().encode(value);
  const digest = await window.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function refuseNonLocalHost() {
  elements.pageSelect.disabled = true;
  elements.reloadButton.disabled = true;
  elements.revertButton.disabled = true;
  elements.saveButton.disabled = true;
  elements.previewLoading.hidden = true;
  elements.preview.srcdoc =
    "<!doctype html><html><body style='font:16px system-ui;padding:40px;color:#17231f'><h1>Local editor unavailable</h1><p>Open this tool from localhost or the loopback address.</p></body></html>";
  setStatus(
    "For safety, the Visual Copy Editor runs only at localhost, 127.0.0.1, or ::1.",
    "error",
  );
}

function pickString(...values) {
  return values.find((value) => typeof value === "string" && value.length > 0) || "";
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(response.ok ? "The editor returned an unreadable response." : text.slice(0, 240));
  }
}

cacheElements();
if (!LOCAL_HOSTNAMES.has(window.location.hostname.toLowerCase())) {
  refuseNonLocalHost();
} else {
  bindEvents();
  setViewport("desktop");
  loadPages();
}
