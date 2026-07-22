(() => {
  "use strict";

  const MESSAGE_SOURCE = "visual-copy-editor";
  const MESSAGE_VERSION = 1;
  const PARENT_ORIGIN = window.location.origin;
  const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  const editableById = new Map();
  const savedHtmlById = new Map();
  const revisionById = new Map();
  const originalAttributes = new WeakMap();
  let activeElement = null;

  function post(type, payload = {}) {
    window.parent.postMessage(
      { source: MESSAGE_SOURCE, version: MESSAGE_VERSION, type, payload },
      PARENT_ORIGIN,
    );
  }

  function readCopy(element) {
    return {
      copyId: element.dataset.copyId || "",
      kind: element.dataset.copyKind || element.tagName.toLowerCase(),
      state: element.dataset.copyState || "source",
      sourceHash: element.dataset.copySourceHash || "",
      revision: revisionById.get(element.dataset.copyId || "") || "",
      tagName: element.tagName.toLowerCase(),
      html: element.innerHTML,
      text: (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim(),
    };
  }

  function rememberAttributes(element) {
    if (originalAttributes.has(element)) return;
    originalAttributes.set(element, {
      contenteditable: element.getAttribute("contenteditable"),
      spellcheck: element.getAttribute("spellcheck"),
      tabindex: element.getAttribute("tabindex"),
      describedby: element.getAttribute("aria-describedby"),
    });
  }

  function restoreAttribute(element, name, value) {
    if (value == null) {
      element.removeAttribute(name);
    } else {
      element.setAttribute(name, value);
    }
  }

  function deactivate(element) {
    if (!element) return;
    const attributes = originalAttributes.get(element);
    if (attributes) {
      restoreAttribute(element, "contenteditable", attributes.contenteditable);
      restoreAttribute(element, "spellcheck", attributes.spellcheck);
      restoreAttribute(element, "tabindex", attributes.tabindex);
      restoreAttribute(element, "aria-describedby", attributes.describedby);
    } else {
      element.removeAttribute("contenteditable");
      element.removeAttribute("spellcheck");
    }
    element.classList.remove("vce-copy-selected");
  }

  function activate(element, event) {
    if (!element || !element.dataset.copyId) return;
    if (activeElement && activeElement !== element) deactivate(activeElement);
    activeElement = element;
    rememberAttributes(element);
    element.setAttribute("contenteditable", "true");
    element.setAttribute("spellcheck", "true");
    element.setAttribute("aria-describedby", "vce-preview-instructions");
    if (!element.hasAttribute("tabindex")) element.setAttribute("tabindex", "0");
    element.classList.add("vce-copy-selected");
    post("vce:select", readCopy(element));

    window.requestAnimationFrame(() => {
      element.focus({ preventScroll: true });
      if (event && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
        placeCaret(event.clientX, event.clientY);
      }
    });
  }

  function placeCaret(x, y) {
    const selection = window.getSelection();
    if (!selection) return;
    let range = null;
    if (document.caretRangeFromPoint) {
      range = document.caretRangeFromPoint(x, y);
    } else if (document.caretPositionFromPoint) {
      const position = document.caretPositionFromPoint(x, y);
      if (position) {
        range = document.createRange();
        range.setStart(position.offsetNode, position.offset);
        range.collapse(true);
      }
    }
    if (range && activeElement?.contains(range.startContainer)) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }

  function resetElement(copyId, html, revision) {
    const element = editableById.get(copyId);
    if (!element) return;
    const restoredHtml = typeof html === "string" ? html : savedHtmlById.get(copyId) || "";
    element.innerHTML = restoredHtml;
    savedHtmlById.set(copyId, restoredHtml);
    if (revision != null && String(revision)) revisionById.set(copyId, String(revision));
    element.classList.remove("vce-copy-dirty");
  }

  function handleDocumentClick(event) {
    const candidate = event.target.closest?.("[data-copy-id]");
    if (candidate) {
      event.preventDefault();
      event.stopPropagation();
      if (candidate.tagName === "SUMMARY" && candidate.parentElement?.tagName === "DETAILS") {
        candidate.parentElement.open = true;
      }
      activate(candidate, event);
      return;
    }

    const link = event.target.closest?.("a[href]");
    if (link) {
      event.preventDefault();
      event.stopPropagation();
      post("vce:notice", {
        message: "Links are paused in editing mode. Choose highlighted copy instead.",
      });
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    event.stopPropagation();
    post("vce:notice", {
      message: "Forms are paused in editing mode. No information was submitted.",
    });
  }

  function handleInput(event) {
    const candidate = event.target.closest?.("[data-copy-id]");
    if (!candidate || candidate !== activeElement) return;
    const copy = readCopy(candidate);
    copy.originalHtml = savedHtmlById.get(copy.copyId) || "";
    candidate.classList.toggle("vce-copy-dirty", copy.html !== copy.originalHtml);
    post("vce:draft", copy);
  }

  function handleFocusIn(event) {
    const candidate = event.target.closest?.("[data-copy-id]");
    if (candidate && candidate !== activeElement) activate(candidate);
  }

  function handleKeydown(event) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      post("vce:save-request");
      return;
    }

    if (event.key === "Escape" && activeElement) {
      event.preventDefault();
      const copyId = activeElement.dataset.copyId;
      resetElement(copyId);
      post("vce:reset", readCopy(activeElement));
      return;
    }

    if (event.key === "Enter" && activeElement?.contains(event.target)) {
      event.preventDefault();
      post("vce:notice", {
        message: "Copy fields do not accept line breaks. Keep typing, or save the current wording.",
      });
    }
  }

  function handlePaste(event) {
    const candidate = event.target.closest?.("[data-copy-id]");
    if (!candidate || candidate !== activeElement) return;
    event.preventDefault();
    const text = (event.clipboardData?.getData("text/plain") || "")
      .replace(/\s*\r?\n+\s*/g, " ");
    if (document.queryCommandSupported?.("insertText")) {
      document.execCommand("insertText", false, text);
      return;
    }
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    candidate.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertFromPaste" }));
  }

  function handleParentMessage(event) {
    if (
      event.origin !== PARENT_ORIGIN ||
      event.source !== window.parent ||
      !event.data ||
      event.data.source !== MESSAGE_SOURCE ||
      event.data.version !== MESSAGE_VERSION
    ) {
      return;
    }
    const { type, payload = {} } = event.data;
    if (type === "vce:reset" && typeof payload.copyId === "string") {
      resetElement(payload.copyId, payload.html, payload.revision);
      return;
    }
    if (type === "vce:save-complete" && typeof payload.copyId === "string") {
      resetElement(payload.copyId, payload.html, payload.revision);
      return;
    }
    if (type === "vce:activate" && typeof payload.copyId === "string") {
      activate(editableById.get(payload.copyId));
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

  async function initialize() {
    if (!LOCAL_HOSTNAMES.has(window.location.hostname.toLowerCase())) return;
    document.documentElement.classList.add("vce-preview");
    const instructions = document.createElement("p");
    instructions.id = "vce-preview-instructions";
    instructions.className = "vce-sr-only";
    instructions.textContent =
      "Editing website copy. Type to revise this field. Press Control or Command S to save, or Escape to revert it.";
    document.body.append(instructions);

    for (const element of document.querySelectorAll("[data-copy-id]")) {
      const copyId = element.dataset.copyId;
      if (!copyId || editableById.has(copyId)) continue;
      editableById.set(copyId, element);
      savedHtmlById.set(copyId, element.innerHTML);
    }

    await Promise.all(
      [...editableById.entries()].map(async ([copyId, element]) => {
        const sourceHash = element.dataset.copySourceHash || "";
        const state = element.dataset.copyState || "source";
        const revision = state === "source" && sourceHash
          ? sourceHash
          : await sha256Hex(element.innerHTML);
        revisionById.set(copyId, revision);
      }),
    );

    document.addEventListener("click", handleDocumentClick, true);
    document.addEventListener("submit", handleSubmit, true);
    document.addEventListener("input", handleInput, true);
    document.addEventListener("focusin", handleFocusIn, true);
    document.addEventListener("keydown", handleKeydown, true);
    document.addEventListener("paste", handlePaste, true);
    window.addEventListener("message", handleParentMessage);

    post("vce:ready", {
      editableCount: editableById.size,
      title: document.title,
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
