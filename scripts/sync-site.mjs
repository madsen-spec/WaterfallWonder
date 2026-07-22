import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bookingLinks, pages, publicDomain } from "./site-data.mjs";
import { applyCopyOverrides, effectiveContentModifiedOn, loadCopyRegistry } from "./visual-copy-model.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");

function escapeAttribute(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function absoluteUrl(pagePath = "") {
  return new URL(pagePath, publicDomain).toString();
}

function prefixFor(page) {
  if (page.file === "404.html") return "/";
  const depth = page.file.split("/").length - 1;
  return "../".repeat(depth);
}

function localHref(page, target) {
  if (page.file === "index.html" && target.startsWith("index.html#")) {
    return target.replace("index.html", "");
  }
  return `${prefixFor(page)}${target}`;
}

function renderButtonIcon() {
  return `<svg class="button__icon" aria-hidden="true" viewBox="0 0 24 24" focusable="false">
          <path d="M5 12h12M13 6l6 6-6 6"></path>
        </svg>`;
}

function renderHeader(page) {
  const isHome = page.file === "index.html";
  const brandHref = isHome ? "#top" : page.file === "404.html" ? "/" : `${prefixFor(page)}index.html`;
  const navLinks = isHome
    ? [
        ["House", "#gallery"],
        ["Waterfall", "#waterfall"],
        ["Sleeping & Group Fit", "sleeping-layout-poconos-cabin/index.html"],
        ["Local Guide", "things-to-do-near-winona-falls/index.html"],
        ["Safety / FAQ", "guest-guide/safety-and-access-notes/index.html"]
      ]
    : [
        ["House", `${prefixFor(page)}index.html#gallery`],
        ["Waterfall", `${prefixFor(page)}index.html#waterfall`],
        ["Sleeping & Group Fit", `${prefixFor(page)}sleeping-layout-poconos-cabin/index.html`],
        ["Local Guide", `${prefixFor(page)}things-to-do-near-winona-falls/index.html`],
        ["Safety / FAQ", `${prefixFor(page)}guest-guide/safety-and-access-notes/index.html`]
      ];

  const renderedNav = navLinks
    .map(([label, href]) => `        <a href="${href}">${label}</a>`)
    .join("\n");

  return `<header class="site-header" data-header>
      <a class="brand" href="${brandHref}" aria-label="Waterfall Wonder home">
        <span class="brand__mark" aria-hidden="true">W</span>
        <span class="brand__text">Waterfall Wonder</span>
      </a>
      <button class="nav-toggle" type="button" data-nav-toggle aria-expanded="false" aria-controls="primary-nav" aria-label="Open site navigation">
        <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
          <path d="M4 7h16M4 12h16M4 17h16"></path>
        </svg>
      </button>
      <nav class="primary-nav" id="primary-nav" aria-label="Primary navigation">
${renderedNav}
      </nav>
      <a class="button button--small button--light" href="${bookingLinks.wanderHome}" target="_blank" rel="noopener noreferrer" aria-label="Check Waterfall Wonder dates and booking details with WanderHome; opens in a new tab">
        Check Dates
        ${renderButtonIcon()}
      </a>
    </header>`;
}

function renderFooter(page) {
  const prefix = prefixFor(page);
  return `<footer class="site-footer">
      <div>
        <p class="footer-brand">Waterfall Wonder</p>
        <p>Waterfall-view Poconos cabin in Bushkill, Pennsylvania.</p>
      </div>
      <nav aria-label="Footer links">
        <a href="${prefix}things-to-do-near-winona-falls/index.html">Local Guide</a>
        <a href="${bookingLinks.wanderHome}" target="_blank" rel="noopener noreferrer">Booking details<span class="visually-hidden">; opens in a new tab</span></a>
        <a href="${bookingLinks.airbnb}" target="_blank" rel="noopener noreferrer">Airbnb<span class="visually-hidden">; opens in a new tab</span></a>
        <a href="${bookingLinks.vrbo}" target="_blank" rel="noopener noreferrer">Vrbo<span class="visually-hidden">; opens in a new tab</span></a>
        <a href="${bookingLinks.instagram}" target="_blank" rel="noopener noreferrer">Instagram<span class="visually-hidden">; opens in a new tab</span></a>
      </nav>
    </footer>`;
}

function renderMobileBooking() {
  return `<a class="mobile-booking" href="${bookingLinks.wanderHome}" target="_blank" rel="noopener noreferrer">Check dates &amp; booking details<span class="visually-hidden">; opens in a new tab</span></a>`;
}

function replaceRequired(text, pattern, replacement, label, file) {
  if (!pattern.test(text)) {
    throw new Error(`Missing ${label} in ${file}`);
  }
  return text.replace(pattern, replacement);
}

function syncSharedChrome(text, page) {
  text = replaceRequired(text, /<header class="site-header[^"]*"[\s\S]*?<\/header>/, renderHeader(page), "site header", page.file);
  text = replaceRequired(text, /<footer class="site-footer">[\s\S]*?<\/footer>/, renderFooter(page), "site footer", page.file);
  text = replaceRequired(text, /<a class="mobile-booking"[\s\S]*?<\/a>/, renderMobileBooking(), "mobile booking CTA", page.file);
  return text;
}

function syncPage(text, page) {
  const url = absoluteUrl(page.path);
  const imageUrl = absoluteUrl(page.ogImage);
  const escapedTitle = escapeAttribute(page.title);
  const escapedDescription = escapeAttribute(page.description);
  const escapedOgTitle = escapeAttribute(page.ogTitle ?? page.title);
  const escapedOgDescription = escapeAttribute(page.ogDescription ?? page.description);

  // When the production domain changes, replace the prior canonical base in
  // structured data and other generated absolute URLs before syncing the
  // individual metadata fields below.
  const existingCanonical = text.match(/<link rel="canonical" href="([^"]*)">/)?.[1];
  if (existingCanonical) {
    const existingBase = page.path
      ? existingCanonical.slice(0, -page.path.length)
      : existingCanonical;
    if (existingBase && existingBase !== publicDomain) {
      text = text.replaceAll(existingBase, publicDomain);
    }
  }

  text = replaceRequired(text, /<title>[^<]*<\/title>/, `<title>${escapedTitle}</title>`, "title", page.file);
  text = replaceRequired(text, /<meta name="description" content="[^"]*">/, `<meta name="description" content="${escapedDescription}">`, "meta description", page.file);
  text = replaceRequired(text, /<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${url}">`, "canonical URL", page.file);
  text = replaceRequired(text, /<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${escapedOgTitle}">`, "og:title", page.file);
  text = replaceRequired(text, /<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${escapedOgDescription}">`, "og:description", page.file);
  text = replaceRequired(text, /<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${url}">`, "og:url", page.file);
  text = replaceRequired(text, /<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${imageUrl}">`, "og:image", page.file);
  text = replaceRequired(text, /<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${escapedOgTitle}">`, "twitter:title", page.file);
  text = replaceRequired(text, /<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${escapedOgDescription}">`, "twitter:description", page.file);
  text = replaceRequired(text, /<meta name="twitter:image" content="[^"]*">/, `<meta name="twitter:image" content="${imageUrl}">`, "twitter:image", page.file);
  text = syncSharedChrome(text, page);

  // Page modification dates are page-specific. Source and claim verification
  // dates are deliberately never rewritten by this synchronizer.
  text = text.replace(/"dateModified":\s*"[^"]+"/g, `"dateModified": "${page.contentModifiedOn}"`);

  return text;
}

function syncSitemap(text, copyRegistry) {
  const existingHomeUrl = text.match(/<url>\s*<loc>([^<]+)<\/loc>/m)?.[1];
  const configuredHomeUrl = absoluteUrl("");
  if (existingHomeUrl && existingHomeUrl !== configuredHomeUrl) {
    text = text.replaceAll(existingHomeUrl, configuredHomeUrl);
  }

  for (const page of pages) {
    const loc = absoluteUrl(page.path);
    const modifiedOn = effectiveContentModifiedOn(copyRegistry, page.file, page.contentModifiedOn);
    const urlBlockPattern = new RegExp(`(<url>\\s*<loc>${loc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}<\\/loc>\\s*<lastmod>)([^<]+)(<\\/lastmod>)`, "m");
    text = text.replace(urlBlockPattern, `$1${modifiedOn}$3`);
  }
  return text;
}

function syncRobots(text) {
  const sitemapUrl = absoluteUrl("sitemap.xml");
  if (/^Sitemap:\s*.*$/im.test(text)) {
    return text.replace(/^Sitemap:\s*.*$/im, `Sitemap: ${sitemapUrl}`);
  }
  return `${text.trimEnd()}\n\nSitemap: ${sitemapUrl}\n`;
}

function syncManifest(text) {
  const manifest = JSON.parse(text);
  const publicPath = new URL(publicDomain).pathname || "/";
  manifest.start_url = publicPath;
  manifest.scope = publicPath;
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

const changed = [];
const copyRegistry = await loadCopyRegistry();

for (const page of pages) {
  const pagePath = path.join(root, page.file);
  const before = await readFile(pagePath, "utf8");
  const effectivePage = {
    ...page,
    contentModifiedOn: effectiveContentModifiedOn(copyRegistry, page.file, page.contentModifiedOn),
  };
  const synced = syncPage(before, effectivePage);
  const after = applyCopyOverrides(synced, page.file, copyRegistry, { strict: true });
  if (after !== before) {
    if (!checkOnly) await writeFile(pagePath, after);
    changed.push(page.file);
  }
}

const notFoundPage = { file: "404.html" };
const notFoundPath = path.join(root, notFoundPage.file);
const notFoundBefore = await readFile(notFoundPath, "utf8");
const notFoundSynced = syncSharedChrome(notFoundBefore, notFoundPage);
const notFoundAfter = applyCopyOverrides(notFoundSynced, notFoundPage.file, copyRegistry, { strict: true });
if (notFoundAfter !== notFoundBefore) {
  if (!checkOnly) await writeFile(notFoundPath, notFoundAfter);
  changed.push(notFoundPage.file);
}

const sitemapPath = path.join(root, "sitemap.xml");
const sitemapBefore = await readFile(sitemapPath, "utf8");
const sitemapAfter = syncSitemap(sitemapBefore, copyRegistry);
if (sitemapAfter !== sitemapBefore) {
  if (!checkOnly) await writeFile(sitemapPath, sitemapAfter);
  changed.push("sitemap.xml");
}

const robotsPath = path.join(root, "robots.txt");
const robotsBefore = await readFile(robotsPath, "utf8");
const robotsAfter = syncRobots(robotsBefore);
if (robotsAfter !== robotsBefore) {
  if (!checkOnly) await writeFile(robotsPath, robotsAfter);
  changed.push("robots.txt");
}

const manifestPath = path.join(root, "site.webmanifest");
const manifestBefore = await readFile(manifestPath, "utf8");
const manifestAfter = syncManifest(manifestBefore);
if (manifestAfter !== manifestBefore) {
  if (!checkOnly) await writeFile(manifestPath, manifestAfter);
  changed.push("site.webmanifest");
}

if (checkOnly) {
  console.log(changed.length ? `Site-data drift found in ${changed.length} files: ${changed.join(", ")}` : "Site data already synced.");
  if (changed.length) process.exitCode = 1;
} else {
  console.log(changed.length ? `Synced ${changed.length} files from site-data.` : "Site data already synced.");
}
