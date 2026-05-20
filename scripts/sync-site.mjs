import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bookingLinks, pages, publicDomain, reviewedOn } from "./site-data.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
  const brandHref = isHome ? "#top" : `${prefixFor(page)}index.html`;
  const navLinks = isHome
    ? [
        ["Waterfall", "#waterfall"],
        ["Reviews", "#reviews"],
        ["Stay", "#stay"],
        ["Gallery", "#gallery"],
        ["Local Guide", "things-to-do-near-winona-falls/index.html"],
        ["Amenities", "#amenities"],
        ["FAQ", "#faq"]
      ]
    : [
        ["Waterfall", `${prefixFor(page)}index.html#waterfall`],
        ["Stay", `${prefixFor(page)}index.html#stay`],
        ["Gallery", `${prefixFor(page)}index.html#gallery`],
        ["Local Guide", `${prefixFor(page)}things-to-do-near-winona-falls/index.html`],
        ["FAQ", `${prefixFor(page)}index.html#faq`]
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
      <a class="button button--small button--light" href="${bookingLinks.wanderHome}" target="_blank" rel="noopener noreferrer" aria-label="Book Waterfall Wonder directly with WanderHome">
        Book Direct
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
        <a href="${bookingLinks.wanderHome}" target="_blank" rel="noopener noreferrer">WanderHome</a>
        <a href="${bookingLinks.airbnb}" target="_blank" rel="noopener noreferrer">Airbnb</a>
        <a href="${bookingLinks.vrbo}" target="_blank" rel="noopener noreferrer">Vrbo</a>
        <a href="${bookingLinks.instagram}" target="_blank" rel="noopener noreferrer">Instagram</a>
      </nav>
    </footer>`;
}

function renderMobileBooking() {
  return `<a class="mobile-booking" href="${bookingLinks.wanderHome}" target="_blank" rel="noopener noreferrer">Book Waterfall Wonder</a>`;
}

function replaceRequired(text, pattern, replacement, label, file) {
  if (!pattern.test(text)) {
    throw new Error(`Missing ${label} in ${file}`);
  }
  return text.replace(pattern, replacement);
}

function syncPage(text, page) {
  const url = absoluteUrl(page.path);
  const imageUrl = absoluteUrl(page.ogImage);
  const escapedTitle = escapeAttribute(page.title);
  const escapedDescription = escapeAttribute(page.description);
  const escapedOgTitle = escapeAttribute(page.ogTitle ?? page.title);
  const escapedOgDescription = escapeAttribute(page.ogDescription ?? page.description);

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
  text = replaceRequired(text, /<header class="site-header"[\s\S]*?<\/header>/, renderHeader(page), "site header", page.file);
  text = replaceRequired(text, /<footer class="site-footer">[\s\S]*?<\/footer>/, renderFooter(page), "site footer", page.file);
  text = replaceRequired(text, /<a class="mobile-booking"[\s\S]*?<\/a>/, renderMobileBooking(), "mobile booking CTA", page.file);

  text = text.replace(/"dateModified":\s*"[^"]+"/g, `"dateModified": "${reviewedOn.iso}"`);
  text = text.replace(/Last reviewed [A-Z][a-z]+ \d{1,2}, \d{4}/g, `Last reviewed ${reviewedOn.label}`);
  text = text.replace(/as of the [A-Z][a-z]+ \d{1,2}(?:, \d{4})? review/gi, `as of the ${reviewedOn.label} review`);
  text = text.replace(/As of the [A-Z][a-z]+ \d{1,2}, \d{4} review/g, `As of the ${reviewedOn.label} review`);
  text = text.replace(/reviewed [A-Z][a-z]+ \d{1,2}, \d{4}/g, `reviewed ${reviewedOn.label}`);
  text = text.replace(/checked [A-Z][a-z]+ \d{1,2}, \d{4}/g, `checked ${reviewedOn.label}`);
  text = text.replace(/checked on [A-Z][a-z]+ \d{1,2}, \d{4}/g, `checked on ${reviewedOn.label}`);

  return text;
}

function syncSitemap(text) {
  for (const page of pages) {
    const loc = absoluteUrl(page.path);
    const urlBlockPattern = new RegExp(`(<url>\\s*<loc>${loc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}<\\/loc>\\s*<lastmod>)([^<]+)(<\\/lastmod>)`, "m");
    text = text.replace(urlBlockPattern, `$1${reviewedOn.iso}$3`);
  }
  return text;
}

function syncManifest(text) {
  const manifest = JSON.parse(text);
  const publicPath = new URL(publicDomain).pathname || "/";
  manifest.start_url = publicPath;
  manifest.scope = publicPath;
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

const changed = [];

for (const page of pages) {
  const pagePath = path.join(root, page.file);
  const before = await readFile(pagePath, "utf8");
  const after = syncPage(before, page);
  if (after !== before) {
    await writeFile(pagePath, after);
    changed.push(page.file);
  }
}

const sitemapPath = path.join(root, "sitemap.xml");
const sitemapBefore = await readFile(sitemapPath, "utf8");
const sitemapAfter = syncSitemap(sitemapBefore);
if (sitemapAfter !== sitemapBefore) {
  await writeFile(sitemapPath, sitemapAfter);
  changed.push("sitemap.xml");
}

const manifestPath = path.join(root, "site.webmanifest");
const manifestBefore = await readFile(manifestPath, "utf8");
const manifestAfter = syncManifest(manifestBefore);
if (manifestAfter !== manifestBefore) {
  await writeFile(manifestPath, manifestAfter);
  changed.push("site.webmanifest");
}

console.log(changed.length ? `Synced ${changed.length} files from site-data.` : "Site data already synced.");
