import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { pages, publicDomain } from "./site-data.mjs";

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = process.env.QA_OUTPUT_DIR || path.join(os.tmpdir(), "waterfall-wonder-browser-qa");
const screenshotDir = path.join(outputRoot, "screenshots");
const reportPath = path.join(outputRoot, "browser-qa-report.json");
const edgeTargetDir = path.join(outputRoot, "edge-target-pages");
const profileDir = path.join(os.tmpdir(), "waterfall-wonder-edge-browser-qa");
const minimumScreenshotBytes = 10 * 1024;
const edgeFallbackCoverageWarning = "Microsoft Edge fallback checks rendered screenshots and local image references, but does not exercise page interactions or detect horizontal overflow; lower homepage section screenshots are isolated previews. Install Playwright for full browser QA.";

const configuredViewports = [
  { label: "reflow-320", width: 320, height: 640 },
  { label: "mobile", width: 390, height: 844 },
  { label: "tablet", width: 768, height: 1024 },
  { label: "desktop", width: 1440, height: 1000 }
];
const viewports = process.env.QA_VIEWPORT_FILTER
  ? configuredViewports.filter((viewport) => viewport.label === process.env.QA_VIEWPORT_FILTER)
  : configuredViewports;
const qaPages = pages.filter((page) =>
  page.file !== "404.html" && (!process.env.QA_PAGE_FILTER || page.file === process.env.QA_PAGE_FILTER)
);

const defaultScreenshotTargets = [{ label: "top", hash: "" }];
const homepageScreenshotTargets = [
  { label: "top", hash: "" },
  { label: "reviews", hash: "#reviews" },
  { label: "waterfall", hash: "#waterfall" },
  { label: "gallery", hash: "#gallery" }
];

function safeSlug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "page";
}

function stripHtml(value) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseTitle(dom) {
  return dom.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || "";
}

function screenshotTargetsFor(pageData) {
  const targets = pageData.file === "index.html" ? homepageScreenshotTargets : defaultScreenshotTargets;
  return process.env.QA_TARGET_FILTER
    ? targets.filter((target) => target.label === process.env.QA_TARGET_FILTER)
    : targets;
}

function targetUrl(filePath, target) {
  return `${pathToFileURL(filePath).href}${target.hash}`;
}

function screenshotFileName(pageFile, target, viewportLabel) {
  const targetSuffix = target.label === "top" ? "" : `-${target.label}`;
  return `${safeSlug(pageFile)}${targetSuffix}-${viewportLabel}.png`;
}

async function edgeTargetUrl(pageData, filePath, target, viewport) {
  if (!target.hash) return pathToFileURL(filePath).href;

  const targetId = target.hash.replace(/^#/, "");
  const targetSelector = targetId.replace(/[^a-z0-9_-]/gi, "");
  const originalHtml = await fs.readFile(filePath, "utf8");
  const baseHref = pathToFileURL(`${root}${path.sep}`).href;
  const targetStyle = `<style>
html,
body[data-edge-qa-target] {
  width: ${viewport.width}px !important;
  max-width: ${viewport.width}px !important;
  overflow-x: hidden !important;
}

body[data-edge-qa-target] .site-header,
body[data-edge-qa-target] .mobile-booking,
body[data-edge-qa-target] main > section:not(#${targetSelector}) {
  display: none !important;
}

body[data-edge-qa-target] main > #${targetSelector} {
  display: block !important;
  min-height: 100vh !important;
}
</style>`;
  const scrollScript = `<script>
(() => {
  const scrollToTarget = () => document.getElementById(${JSON.stringify(targetId)})?.scrollIntoView({ block: "start" });
  scrollToTarget();
  setTimeout(scrollToTarget, 50);
  setTimeout(scrollToTarget, 250);
  setTimeout(scrollToTarget, 800);
})();
</script>`;
  const targetHtml = originalHtml
    .replace(/<head>/i, `<head>\n    <base href="${baseHref}">\n    ${targetStyle}`)
    .replace(/<body([^>]*)>/i, `<body$1 data-edge-qa-target="${targetId}">`)
    .replace(/<\/body>/i, `    ${scrollScript}\n  </body>`);
  const targetPath = path.join(edgeTargetDir, `${safeSlug(pageData.file)}-${target.label}-${viewport.label}.html`);
  await fs.mkdir(edgeTargetDir, { recursive: true });
  await fs.writeFile(targetPath, targetHtml, "utf8");
  return pathToFileURL(targetPath).href;
}

function decodeHtmlAttribute(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function attributeValue(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match ? decodeHtmlAttribute(match[1] ?? match[2] ?? match[3] ?? "") : null;
}

function isInsideRoot(target) {
  const fromRoot = path.relative(root, target);
  return fromRoot === "" || (!fromRoot.startsWith("..") && !path.isAbsolute(fromRoot));
}

function localAssetPath(pageFile, reference) {
  if (!reference || /^(data:|mailto:|tel:|javascript:)/i.test(reference)) return null;
  const clean = reference.split("#")[0].split("?")[0];
  if (!clean) return null;

  if (/^https?:\/\//i.test(clean)) {
    if (!clean.startsWith(publicDomain)) return null;
    const publicPath = new URL(publicDomain).pathname.replace(/\/$/, "");
    const resourcePath = new URL(clean).pathname;
    const relativePath = resourcePath.startsWith(`${publicPath}/`)
      ? resourcePath.slice(publicPath.length + 1)
      : resourcePath.replace(/^\/+/, "");
    const target = path.join(root, ...relativePath.split("/"));
    return isInsideRoot(target) ? target : null;
  }

  if (/^file:/i.test(clean)) {
    const target = fileURLToPath(clean);
    return isInsideRoot(target) ? target : null;
  }

  if (clean.startsWith("/")) {
    const publicBasePath = new URL(publicDomain).pathname.replace(/\/$/, "");
    const relativePath = publicBasePath && clean.startsWith(`${publicBasePath}/`)
      ? clean.slice(publicBasePath.length + 1)
      : clean.replace(/^\/+/, "");
    const target = path.join(root, ...relativePath.split("/"));
    return isInsideRoot(target) ? target : null;
  }

  const target = path.resolve(path.dirname(path.join(root, ...pageFile.split("/"))), clean);
  return isInsideRoot(target) ? target : null;
}

async function collectDomImageIssues(dom, pageFile) {
  const missingAlt = [];
  const brokenImages = [];
  const imageTags = Array.from(dom.matchAll(/<img\b[^>]*>/gi)).map((match) => match[0]);

  for (const imageTag of imageTags) {
    const src = attributeValue(imageTag, "src") || attributeValue(imageTag, "data-src") || "";
    if (attributeValue(imageTag, "alt") === null) {
      missingAlt.push(src || "(img without src)");
    }

    const localPath = localAssetPath(pageFile, src);
    if (localPath) {
      try {
        const imageStat = await fs.stat(localPath);
        if (!imageStat.isFile()) brokenImages.push(src);
      } catch {
        brokenImages.push(src);
      }
    }
  }

  return { missingAlt, brokenImages };
}

function countBookingLinks(dom) {
  const links = Array.from(dom.matchAll(/<a\b[^>]*\bhref=(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi));
  return links.filter((match) => /(?:gowanderhome\.com|airbnb\.com|vrbo\.com)/i.test(match[1] ?? match[2] ?? match[3] ?? "")).length;
}

async function maybeLoadPlaywright() {
  const configuredImport = process.env.PLAYWRIGHT_IMPORT_PATH
    ? pathToFileURL(path.resolve(process.env.PLAYWRIGHT_IMPORT_PATH)).href
    : null;
  const candidates = [configuredImport, "playwright"].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const playwright = await import(candidate);
      return playwright.chromium ? playwright : playwright.default;
    } catch {
      // Try the next configured or package import location.
    }
  }

  return null;
}

async function findEdge() {
  const candidates = [
    process.env.EDGE_PATH,
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try the next known install location.
    }
  }
  return null;
}

async function runWithPlaywright(playwright) {
  const launchOptions = { headless: true };
  if (process.env.PLAYWRIGHT_CHANNEL) {
    launchOptions.channel = process.env.PLAYWRIGHT_CHANNEL;
  }
  if (process.env.PLAYWRIGHT_EXECUTABLE_PATH) {
    launchOptions.executablePath = path.resolve(process.env.PLAYWRIGHT_EXECUTABLE_PATH);
  }
  const browser = await playwright.chromium.launch(launchOptions);
  const results = [];

  async function collectInteractionErrors(page, file, viewport) {
    const interactionErrors = [];

    const navToggle = page.locator("[data-nav-toggle]");
    if ((await navToggle.count()) === 1 && await navToggle.isVisible()) {
      await navToggle.click();
      if ((await navToggle.getAttribute("aria-expanded")) !== "true") {
        interactionErrors.push("mobile navigation did not open after toggle click");
      }

      const navMetrics = await page.evaluate(() => {
        const nav = document.querySelector("#primary-nav");
        const toggle = document.querySelector("[data-nav-toggle]");
        const navRect = nav?.getBoundingClientRect();
        const toggleRect = toggle?.getBoundingClientRect();
        const undersizedLinks = Array.from(nav?.querySelectorAll("a") ?? [])
          .map((link) => ({ label: link.textContent.trim(), rect: link.getBoundingClientRect() }))
          .filter(({ rect }) => rect.width < 44 || rect.height < 44)
          .map(({ label, rect }) => `${label || "unnamed link"} (${Math.round(rect.width)}x${Math.round(rect.height)})`);

        return {
          navLeft: navRect?.left ?? null,
          navRight: navRect?.right ?? null,
          navWidth: navRect?.width ?? null,
          viewportWidth: window.innerWidth,
          toggleWidth: toggleRect?.width ?? null,
          toggleHeight: toggleRect?.height ?? null,
          undersizedLinks
        };
      });

      if (navMetrics.navWidth === null || navMetrics.navWidth < navMetrics.viewportWidth - 2 || navMetrics.navLeft > 1 || navMetrics.navRight < navMetrics.viewportWidth - 1) {
        interactionErrors.push(`mobile navigation does not stretch across the usable viewport (${Math.round(navMetrics.navWidth ?? 0)}px of ${navMetrics.viewportWidth}px)`);
      }
      if ((navMetrics.toggleWidth ?? 0) < 44 || (navMetrics.toggleHeight ?? 0) < 44) {
        interactionErrors.push(`mobile navigation toggle is smaller than 44px (${Math.round(navMetrics.toggleWidth ?? 0)}x${Math.round(navMetrics.toggleHeight ?? 0)})`);
      }
      if (navMetrics.undersizedLinks.length) {
        interactionErrors.push(`mobile navigation links are smaller than 44px: ${navMetrics.undersizedLinks.join(", ")}`);
      }

      const firstNavLink = page.locator("#primary-nav a").first();
      await firstNavLink.focus();
      await page.keyboard.press("Escape");
      if ((await navToggle.getAttribute("aria-expanded")) !== "false") {
        interactionErrors.push("mobile navigation did not close after Escape");
      }
      const navFocusRestored = await page.evaluate(() => document.activeElement === document.querySelector("[data-nav-toggle]"));
      if (!navFocusRestored) {
        interactionErrors.push("mobile navigation did not return focus to its toggle after Escape");
      }
      if (await page.locator("#primary-nav").isVisible()) {
        interactionErrors.push("mobile navigation remained visible after Escape");
      }
      const navCleanupComplete = await page.evaluate(() => {
        const backdrop = document.querySelector(".nav-backdrop");
        return !document.body.classList.contains("is-nav-open") && !backdrop?.classList.contains("is-visible");
      });
      if (!navCleanupComplete) {
        interactionErrors.push("mobile navigation did not clear its backdrop or page lock after Escape");
      }

      await navToggle.click();
      await navToggle.click();
      if ((await navToggle.getAttribute("aria-expanded")) !== "false") {
        interactionErrors.push("mobile navigation did not close after a second toggle click");
      }

      const noJavaScriptFallback = await page.evaluate(() => {
        document.documentElement.classList.remove("js");
        const nav = document.querySelector("#primary-nav");
        const toggle = document.querySelector("[data-nav-toggle]");
        const navVisible = Boolean(nav && getComputedStyle(nav).display !== "none" && nav.getBoundingClientRect().height > 0);
        const toggleHidden = Boolean(toggle && getComputedStyle(toggle).display === "none");
        document.documentElement.classList.add("js");
        return { navVisible, toggleHidden };
      });
      if (!noJavaScriptFallback.navVisible || !noJavaScriptFallback.toggleHidden) {
        interactionErrors.push("mobile navigation has no usable no-JavaScript fallback");
      }
    }

    const accessibilityFailures = await page.evaluate(() => {
      const failures = [];
      const rootStyles = getComputedStyle(document.documentElement);

      function rgb(color) {
        const value = color.trim();
        if (/^#[0-9a-f]{6}$/i.test(value)) {
          return [1, 3, 5].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
        }
        const match = value.match(/^rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
        return match ? match.slice(1, 4).map(Number) : null;
      }

      function luminance(color) {
        const channels = rgb(color)?.map((channel) => {
          const normalized = channel / 255;
          return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
        });
        return channels ? 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2] : null;
      }

      function contrast(foreground, background) {
        const first = luminance(foreground);
        const second = luminance(background);
        if (first === null || second === null) return null;
        return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
      }

      const muted = rootStyles.getPropertyValue("--muted");
      for (const backgroundName of ["--paper", "--cream"]) {
        const background = rootStyles.getPropertyValue(backgroundName);
        const ratio = contrast(muted, background);
        if (ratio === null || ratio < 4.5) {
          failures.push(`muted text contrast on ${backgroundName} is ${ratio?.toFixed(2) ?? "unreadable"}:1`);
        }
      }

      const undersizedDots = Array.from(document.querySelectorAll(".review-carousel__dots button, .waterfall-carousel__dots button"))
        .map((button) => ({ label: button.getAttribute("aria-label") || "carousel dot", rect: button.getBoundingClientRect() }))
        .filter(({ rect }) => rect.width < 24 || rect.height < 24)
        .map(({ label, rect }) => `${label} (${Math.round(rect.width)}x${Math.round(rect.height)})`);
      if (undersizedDots.length) failures.push(`carousel dot targets are smaller than 24px: ${undersizedDots.join(", ")}`);

      const unannouncedNewTabs = Array.from(document.querySelectorAll('a[target="_blank"]'))
        .filter((link) => !((link.getAttribute("aria-label") || link.textContent).toLowerCase().includes("opens in a new tab")));
      if (unannouncedNewTabs.length) failures.push(`${unannouncedNewTabs.length} new-tab link(s) do not announce their behavior`);

      return failures;
    });
    interactionErrors.push(...accessibilityFailures);

    if (viewport === "mobile" || viewport === "reflow-320") {
      const footerLink = page.locator(".site-footer a").last();
      if (await footerLink.count()) {
        await footerLink.focus();
        await footerLink.evaluate((link) => link.scrollIntoView({ block: "nearest" }));
        await page.waitForTimeout(75);
        const focusedControlObscured = await page.evaluate(() => {
          const bookingBar = document.querySelector(".mobile-booking");
          const focused = document.activeElement;
          if (!bookingBar || !focused || getComputedStyle(bookingBar).display === "none" || bookingBar.classList.contains("is-hidden")) return false;
          const barRect = bookingBar.getBoundingClientRect();
          const focusRect = focused.getBoundingClientRect();
          return focusRect.bottom > barRect.top && focusRect.top < barRect.bottom;
        });
        if (focusedControlObscured) {
          interactionErrors.push("fixed booking bar obscures a focused footer control");
        }
      }
    }

    if (viewport === "reflow-320") {
      await page.setViewportSize({ width: 320, height: 256 });
      await page.evaluate(() => window.scrollTo(0, 320));
      await page.waitForTimeout(75);
      const shortViewportState = await page.evaluate(() => {
        const bookingBar = document.querySelector(".mobile-booking");
        return {
          bookingVisible: Boolean(bookingBar && getComputedStyle(bookingBar).display !== "none" && !bookingBar.classList.contains("is-hidden")),
          bookingFocusable: Boolean(bookingBar && bookingBar.tabIndex >= 0 && bookingBar.getAttribute("aria-hidden") !== "true"),
          horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2
        };
      });
      if (shortViewportState.bookingVisible || shortViewportState.bookingFocusable) {
        interactionErrors.push("fixed booking bar remains visible or focusable in a short zoom/landscape viewport");
      }
      if (shortViewportState.horizontalOverflow) {
        interactionErrors.push("320px reflow check has horizontal overflow");
      }
    }

    if (file === "index.html") {
      const carouselFailures = await page.evaluate(() => {
        const failures = [];
        document.querySelectorAll("[data-carousel]").forEach((carousel, index) => {
          const slides = Array.from(carousel.querySelectorAll("[data-carousel-slide]"));
          const next = carousel.querySelector("[data-carousel-next]");
          if (slides.length < 2 || !next) return;

          const before = slides.findIndex((slide) => slide.classList.contains("is-active"));
          next.click();
          const after = slides.findIndex((slide) => slide.classList.contains("is-active"));
          const currentDots = carousel.querySelectorAll('[data-carousel-dot][aria-current="true"]').length;
          const activeHidden = slides[after]?.getAttribute("aria-hidden");

          if (before === after) failures.push(`carousel ${index + 1} did not advance`);
          if (currentDots !== 1) failures.push(`carousel ${index + 1} has ${currentDots} current dots`);
          if (activeHidden === "true") failures.push(`carousel ${index + 1} marks the active slide hidden`);
        });
        return failures;
      });
      interactionErrors.push(...carouselFailures);

      const galleryButton = page.locator(".gallery-button").first();
      if (await galleryButton.count()) {
        await galleryButton.focus();
        await galleryButton.click();
        const lightboxOpened = await page.locator("[data-lightbox]").evaluate((dialog) => dialog.open || dialog.hasAttribute("open"));
        const lightboxSrc = await page.locator("[data-lightbox-image]").getAttribute("src");
        if (!lightboxOpened) interactionErrors.push("lightbox did not open from gallery button");
        if (!lightboxSrc) interactionErrors.push("lightbox image was not populated after opening");

        await page.keyboard.press("Escape");
        await page.waitForFunction(() => {
          const dialog = document.querySelector("[data-lightbox]");
          const image = document.querySelector("[data-lightbox-image]");
          return dialog && image && !dialog.open && !dialog.hasAttribute("open") && !image.getAttribute("src");
        }, null, { timeout: 3000 }).catch(() => {});
        const lightboxClosed = await page.locator("[data-lightbox]").evaluate((dialog) => !dialog.open && !dialog.hasAttribute("open"));
        const imageCleared = await page.locator("[data-lightbox-image]").evaluate((image) => !image.getAttribute("src"));
        const focusRestored = await page.evaluate(() => document.activeElement?.classList.contains("gallery-button"));
        if (!lightboxClosed) interactionErrors.push("lightbox did not close after Escape");
        if (!imageCleared) interactionErrors.push("lightbox image source was not cleared after close");
        if (!focusRestored) interactionErrors.push("lightbox did not restore focus to the gallery trigger");
      }
    }

    return interactionErrors.map((error) => `${viewport}: ${error}`);
  }

  for (const pageData of qaPages) {
    for (const target of screenshotTargetsFor(pageData)) {
      for (const viewport of viewports) {
      const page = await browser.newPage({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1
      });
      const errors = [];
      page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(`console: ${message.text()}`);
      });

      const filePath = path.join(root, ...pageData.file.split("/"));
      await page.goto(targetUrl(filePath, target), { waitUntil: "networkidle", timeout: 30000 });
      const screenshotPath = path.join(screenshotDir, screenshotFileName(pageData.file, target, viewport.label));
      await page.screenshot({ path: screenshotPath, fullPage: false });
      const imageStats = await fs.stat(screenshotPath);

      const result = {
        qaEngine: "playwright",
        coverage: {
          screenshots: true,
          renderedDom: true,
          javascriptErrors: true,
          interactions: true,
          horizontalOverflow: true,
          imageNaturalSize: true,
          localImageReferences: true
        },
        file: pageData.file,
        target: target.label,
        viewport: viewport.label,
        title: await page.title(),
        bodyTextLength: (await page.locator("body").innerText()).trim().length,
        brokenImages: await page.$$eval("img", (images) =>
          images
            .map((image) => ({
              source: image.getAttribute("src") || image.currentSrc,
              broken: image.complete && (image.naturalWidth === 0 || image.naturalHeight === 0)
            }))
            .filter((image) => image.source && image.broken)
            .map((image) => image.source)
        ),
        missingAlt: await page.$$eval("img", (images) =>
          images.filter((image) => !image.hasAttribute("alt")).map((image) => image.getAttribute("src") || image.currentSrc)
        ),
        horizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2),
        horizontalOverflowSources: await page.evaluate(() =>
          Array.from(document.querySelectorAll("body *"))
            .map((element) => {
              const rect = element.getBoundingClientRect();
              return {
                element: `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}${typeof element.className === "string" && element.className ? `.${element.className.trim().replace(/\s+/g, ".")}` : ""}`,
                left: Math.round(rect.left),
                right: Math.round(rect.right),
                width: Math.round(rect.width)
              };
            })
            .filter(({ left, right }) => left < -2 || right > window.innerWidth + 2)
            .slice(0, 20)
        ),
        bookingLinkCount: await page.locator('a[href*="gowanderhome.com"], a[href*="airbnb.com"], a[href*="vrbo.com"]').count(),
        screenshotPath,
        screenshotBytes: imageStats.size,
        errors
      };

      result.errors.push(...await collectInteractionErrors(page, pageData.file, viewport.label));
      results.push(result);
      await page.close();
      }
    }
  }

  await browser.close();
  return results;
}

async function runWithEdge(edgePath) {
  await fs.rm(profileDir, { recursive: true, force: true });
  await fs.mkdir(profileDir, { recursive: true });
  const results = [];

  async function runEdge(args) {
    return run(edgePath, args, {
      maxBuffer: 20 * 1024 * 1024,
      timeout: 45000,
      windowsHide: true
    });
  }

  for (const pageData of qaPages) {
    for (const target of screenshotTargetsFor(pageData)) {
      for (const viewport of viewports) {
      const filePath = path.join(root, ...pageData.file.split("/"));
      const fileUrl = await edgeTargetUrl(pageData, filePath, target, viewport);
      const screenshotPath = path.join(screenshotDir, screenshotFileName(pageData.file, target, viewport.label));
      const args = [
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--allow-file-access-from-files",
        `--user-data-dir=${profileDir}`,
        `--window-size=${viewport.width},${viewport.height}`,
        "--virtual-time-budget=2000"
      ];

      await runEdge([...args, `--screenshot=${screenshotPath}`, fileUrl]);
      const domRun = await runEdge([...args, "--dump-dom", fileUrl]);
      const dom = domRun.stdout || "";
      const imageStats = await fs.stat(screenshotPath);
      const imageIssues = await collectDomImageIssues(dom, pageData.file);
      results.push({
        qaEngine: "edge-fallback",
        coverage: {
          screenshots: true,
          renderedDom: true,
          javascriptErrors: false,
          interactions: false,
          horizontalOverflow: false,
          imageNaturalSize: false,
          localImageReferences: true
        },
        file: pageData.file,
        target: target.label,
        viewport: viewport.label,
        title: parseTitle(dom),
        bodyTextLength: stripHtml(dom).length,
        brokenImages: imageIssues.brokenImages,
        missingAlt: imageIssues.missingAlt,
        horizontalOverflow: null,
        horizontalOverflowSources: [],
        bookingLinkCount: countBookingLinks(dom),
        screenshotPath,
        screenshotBytes: imageStats.size,
        errors: [],
        warnings: [edgeFallbackCoverageWarning]
      });
      }
    }
  }

  return results;
}

await fs.mkdir(screenshotDir, { recursive: true });

const playwright = await maybeLoadPlaywright();
const edgePath = playwright ? null : await findEdge();
const results = playwright
  ? await runWithPlaywright(playwright)
  : edgePath
    ? await runWithEdge(edgePath)
    : null;

if (!results) {
  throw new Error("Browser QA requires Playwright or Microsoft Edge.");
}

await fs.writeFile(reportPath, `${JSON.stringify(results, null, 2)}\n`, "utf8");

const failures = results.filter((result) =>
  !result.title ||
  result.bodyTextLength <= 1000 ||
  result.brokenImages?.length > 0 ||
  result.missingAlt?.length > 0 ||
  result.horizontalOverflow ||
  result.screenshotBytes < minimumScreenshotBytes ||
  result.errors?.length > 0
);
const qaEngines = Array.from(new Set(results.map((result) => result.qaEngine ?? "unknown")));
const qaWarnings = Array.from(new Set(results.flatMap((result) => result.warnings ?? [])));

console.log(`Browser QA checked ${results.length} page/viewport combinations.`);
console.log(`Browser QA engine: ${qaEngines.join(", ")}`);
console.log(`Report: ${reportPath}`);
console.log(`Screenshots: ${screenshotDir}`);
if (qaWarnings.length) {
  console.log("\nBrowser QA coverage notes:");
  for (const warning of qaWarnings) console.log(`- ${warning}`);
}

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}
