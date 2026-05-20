import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { officialSources, pages as registeredPages, propertyImageRegistry, publicDomain, reviewedOn } from "./site-data.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicUrl = new URL(publicDomain);
const publicBasePath = publicUrl.pathname.replace(/\/$/, "");
const expectedManifestBase = publicUrl.pathname || "/";
const textExtensions = new Set([".html", ".css", ".js", ".json", ".svg", ".xml", ".txt", ".md", ".webmanifest", ".yml", ".yaml"]);
const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"]);
const requiredFiles = [
  "index.html",
  "404.html",
  "styles.css",
  "script.js",
  "robots.txt",
  "sitemap.xml",
  "SOURCE_LEDGER.csv",
  "SOURCE_LEDGER.md",
  ".nojekyll",
  "CONTENT_SOURCES.md",
  "MAINTENANCE_CHECKLIST.md"
];
const forbiddenEntries = ["node_modules", ".env", ".env.local", ".env.production", "secrets", "credentials"];
const sensitivePattern = /(api[_-]?key|client[_-]?secret|password|passwd|private key|begin rsa|begin openssh|github_pat_|ghp_|sk_live|aws_secret|smtp_password)/i;
const privateWorkspacePattern = /(G:\\|My Drive|Sorted Photos|01_Source_ReadOnly|02_Sandbox_Copies|03_Outputs|04_Scripts|05_Indexes|06_Logs|site_versions|qa_screenshots)/i;
const conservativeClaimPattern = /\b(luxury|top\s+\d+|#1)\b/i;
const oversizedImageBytes = 800 * 1024;
const totalImageWarningBytes = 35 * 1024 * 1024;
const staleDateWarningDays = 60;
const forbiddenStructuredDataFields = new Set(["streetAddress", "postalCode", "geo", "latitude", "longitude", "telephone", "email"]);

const errors = [];
const warnings = [];
const htmlTexts = new Map();
const registeredPageMap = new Map(registeredPages.map((page) => [page.file, page]));
const seenTitles = new Map();
const seenDescriptions = new Map();
const imageRegistryKeys = new Set(propertyImageRegistry.map((image) => imageKey(image.file)));

function imageKey(reference) {
  const filename = path.basename(reference).replace(/\.(jpe?g|webp|png|gif|svg)$/i, "");
  return filename.replace(/-(800|1200|1800)$/i, "");
}

function isPropertyImage(reference) {
  const filename = path.basename(reference).toLowerCase();
  if (filename.startsWith("guide-") || filename.startsWith("nps-") || filename === "waterfall-wonder-og.jpg") return false;
  return /\.(jpe?g|webp|png)$/i.test(filename);
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

function displayPath(filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, "/");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isInsideRoot(target) {
  const fromRoot = path.relative(root, target);
  return fromRoot === "" || (!fromRoot.startsWith("..") && !path.isAbsolute(fromRoot));
}

function firstMatch(text, pattern) {
  return text.match(pattern)?.[1]?.trim() || "";
}

function metaContent(text, attributeName, attributeValue) {
  const pattern = new RegExp(`<meta\\s+[^>]*\\b${attributeName}=["']${escapeRegExp(attributeValue)}["'][^>]*\\bcontent=(?:"([^"]*)"|'([^']*)')[^>]*>`, "i");
  const match = text.match(pattern);
  return (match?.[1] ?? match?.[2] ?? "").trim();
}

function localTarget(fromFile, rawReference) {
  if (!rawReference || rawReference.startsWith("#")) return null;
  if (/^(mailto:|tel:|javascript:|data:)/i.test(rawReference)) return null;
  let isPublicDomainReference = false;
  if (/^https?:\/\//i.test(rawReference)) {
    if (!rawReference.startsWith(publicDomain)) return null;
    rawReference = rawReference.slice(publicDomain.length);
    isPublicDomainReference = true;
  }
  const clean = rawReference.split("#")[0].split("?")[0];
  if (!clean) return null;
  if (isPublicDomainReference) return path.join(root, clean);
  if (clean.startsWith("/")) {
    const siteRelative = publicBasePath && clean.startsWith(`${publicBasePath}/`)
      ? clean.slice(publicBasePath.length + 1)
      : clean.replace(/^\/+/, "");
    return path.join(root, ...siteRelative.split("/"));
  }
  if (clean.startsWith("assets/")) return path.join(root, clean);
  if (clean.startsWith("../") || clean.startsWith("./")) return path.resolve(path.dirname(fromFile), clean);
  return path.resolve(path.dirname(fromFile), clean);
}

function collectReferences(filePath, text) {
  const refs = [];
  const quotedAttr = /\b(?:src|href|data-full|poster)=["']([^"']+)["']/gi;
  for (const match of text.matchAll(quotedAttr)) refs.push(match[1]);

  const srcsetAttr = /\bsrcset=["']([^"']+)["']/gi;
  for (const match of text.matchAll(srcsetAttr)) {
    for (const item of match[1].split(",")) refs.push(item.trim().split(/\s+/)[0]);
  }

  const escapedPublicDomain = publicDomain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const absoluteAsset = new RegExp(`${escapedPublicDomain}(assets/images/[^"<\\s]+)`, "g");
  for (const match of text.matchAll(absoluteAsset)) refs.push(`${publicDomain}${match[1]}`);

  return refs
    .map((ref) => [ref, localTarget(filePath, ref)])
    .filter(([, target]) => target && isInsideRoot(target));
}

function collectForbiddenStructuredDataFields(value, trail = []) {
  if (!value || typeof value !== "object") return [];

  const matches = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      matches.push(...collectForbiddenStructuredDataFields(item, [...trail, `[${index}]`]));
    });
    return matches;
  }

  for (const [key, childValue] of Object.entries(value)) {
    const nextTrail = [...trail, key];
    if (forbiddenStructuredDataFields.has(key)) {
      matches.push(nextTrail.join("."));
    }
    matches.push(...collectForbiddenStructuredDataFields(childValue, nextTrail));
  }

  return matches;
}

for (const rel of requiredFiles) {
  try {
    const fileStat = await stat(path.join(root, rel));
    if (!fileStat.isFile()) errors.push(`Required file is not a file: ${rel}`);
  } catch {
    errors.push(`Missing required file: ${rel}`);
  }
}

for (const name of forbiddenEntries) {
  try {
    await stat(path.join(root, name));
    errors.push(`Forbidden private/local entry is present in public package: ${name}`);
  } catch {
    // Good: the private/local entry is absent.
  }
}

const packageJsonText = await readFile(path.join(root, "package.json"), "utf8").catch(() => "");
try {
  const packageJson = JSON.parse(packageJsonText);
  if (!packageJson.scripts || typeof packageJson.scripts !== "object") {
    errors.push("package.json is missing a scripts object.");
  } else {
    for (const [scriptName, command] of Object.entries(packageJson.scripts)) {
      if (typeof command !== "string") {
        errors.push(`package.json script is not a string: ${scriptName}`);
        continue;
      }
      const scriptRefs = command.matchAll(/\bnode\s+(scripts\/[^\s&|]+\.mjs)\b/g);
      for (const refMatch of scriptRefs) {
        const scriptPath = path.join(root, ...refMatch[1].split("/"));
        try {
          const scriptStat = await stat(scriptPath);
          if (!scriptStat.isFile()) errors.push(`package.json script "${scriptName}" references a non-file: ${refMatch[1]}`);
        } catch {
          errors.push(`package.json script "${scriptName}" references a missing file: ${refMatch[1]}`);
        }
      }
    }
  }
} catch (error) {
  errors.push(`package.json is not valid JSON: ${error.message}`);
}

const files = await walk(root);
let totalImageBytes = 0;
for (const file of files) {
  const extension = path.extname(file).toLowerCase();
  if (imageExtensions.has(extension)) {
    const imageStat = await stat(file);
    totalImageBytes += imageStat.size;
    if (imageStat.size > oversizedImageBytes) {
      warnings.push(`Large image asset (${Math.round(imageStat.size / 1024)} KB): ${displayPath(file)}`);
    }
  }

  if (!textExtensions.has(extension)) continue;

  const text = await readFile(file, "utf8");
  if (sensitivePattern.test(text)) {
    warnings.push(`Review possible sensitive wording in ${displayPath(file)}`);
  }
  if (privateWorkspacePattern.test(text)) {
    errors.push(`Public package appears to mention a private workspace/source path in ${displayPath(file)}`);
  }
  if (conservativeClaimPattern.test(text) && displayPath(file) !== "scripts/validate-site.mjs") {
    warnings.push(`Review marketing/testimonial wording for support in ${displayPath(file)}`);
  }
  if (displayPath(file).startsWith(".github/workflows/")) {
    const deploymentPatterns = [
      /\bpages:\s*write\b/i,
      /actions\/deploy-pages/i,
      /peaceiris\/actions-gh-pages/i,
      /\bgh-pages\b/i
    ];
    for (const pattern of deploymentPatterns) {
      if (pattern.test(text)) {
        errors.push(`GitHub Actions workflow appears to enable public deployment without launch approval: ${displayPath(file)}`);
        break;
      }
    }
  }

  if (extension === ".html") {
    const rel = displayPath(file);
    const registeredPage = registeredPageMap.get(rel);
    htmlTexts.set(file, text);

    if (!/^<!doctype html>/i.test(text.trimStart())) {
      errors.push(`HTML page is missing <!doctype html>: ${rel}`);
    }
    if (!/<html\b[^>]*\blang=["']en["'][^>]*>/i.test(text)) {
      errors.push(`HTML page is missing lang="en": ${rel}`);
    }
    if (!/<meta\s+charset=["']?utf-8["']?\s*>/i.test(text)) {
      errors.push(`HTML page is missing utf-8 charset: ${rel}`);
    }
    if (!/<meta\s+name=["']viewport["']\s+content=["']width=device-width,\s*initial-scale=1["']\s*>/i.test(text)) {
      errors.push(`HTML page is missing the expected responsive viewport meta tag: ${rel}`);
    }
    if (!/<a\b[^>]*class=["'][^"']*\bskip-link\b[^"']*["'][^>]*href=["']#main["'][^>]*>/i.test(text)) {
      errors.push(`HTML page is missing the skip link to #main: ${rel}`);
    }
    if (!/<main\b[^>]*\bid=["']main["'][^>]*>/i.test(text)) {
      errors.push(`HTML page is missing <main id="main">: ${rel}`);
    }

    const h1Count = Array.from(text.matchAll(/<h1\b/gi)).length;
    if (h1Count !== 1) {
      errors.push(`HTML page must have exactly one h1; found ${h1Count} in ${rel}`);
    }

    const externalRuntimeResources = [
      ...text.matchAll(/<(?:script|img|source|video|audio|iframe)\b[^>]*\b(?:src|poster)=["'](https?:\/\/[^"']+)["'][^>]*>/gi),
      ...text.matchAll(/<link\b(?=[^>]*\brel=["'][^"']*(?:stylesheet|preload|modulepreload|manifest|icon)[^"']*["'])[^>]*\bhref=["'](https?:\/\/[^"']+)["'][^>]*>/gi)
    ];
    for (const resourceMatch of externalRuntimeResources) {
      const resourceUrl = resourceMatch[1];
      if (!resourceUrl.startsWith(publicDomain)) {
        errors.push(`External runtime/media resource is not allowed in public HTML ${rel}: ${resourceUrl}`);
      }
    }

    const title = text.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim();
    const description = text.match(/<meta name=["']description["'] content=["']([^"']*)["']/i)?.[1]?.trim();
    if (!title) errors.push(`HTML page is missing a title: ${rel}`);
    if (!description) errors.push(`HTML page is missing a meta description: ${rel}`);
    if (title) {
      if (title.length > 60) warnings.push(`Title may truncate (${title.length} chars) in ${rel}: ${title}`);
      const titlePages = seenTitles.get(title) ?? [];
      titlePages.push(rel);
      seenTitles.set(title, titlePages);
    }
    if (description) {
      if (description.length > 160) warnings.push(`Meta description is long (${description.length} chars) in ${rel}`);
      if (description.length < 95 && rel !== "404.html") warnings.push(`Meta description is short (${description.length} chars) in ${rel}`);
      const descriptionPages = seenDescriptions.get(description) ?? [];
      descriptionPages.push(rel);
      seenDescriptions.set(description, descriptionPages);
    }

    if (rel !== "404.html") {
      for (const requiredMeta of [
        /<meta property=["']og:title["'] content="[^"]+">/i,
        /<meta property=["']og:description["'] content="[^"]+">/i,
        /<meta property=["']og:image["'] content="[^"]+">/i,
        /<meta name=["']twitter:title["'] content="[^"]+">/i,
        /<meta name=["']twitter:description["'] content="[^"]+">/i,
        /<meta name=["']twitter:image["'] content="[^"]+">/i
      ]) {
        if (!requiredMeta.test(text)) errors.push(`Missing Open Graph/Twitter metadata in ${rel}: ${requiredMeta}`);
      }
    }

    if (registeredPage) {
      if (title && title !== registeredPage.title) errors.push(`Title does not match site-data in ${rel}`);
      if (description && description !== registeredPage.description) errors.push(`Description does not match site-data in ${rel}`);
      const canonical = text.match(/<link rel=["']canonical["'] href=["']([^"']+)["']>/i)?.[1];
      const expectedCanonical = new URL(registeredPage.path, publicDomain).toString();
      if (canonical !== expectedCanonical) errors.push(`Canonical does not match site-data in ${rel}: ${canonical}`);

      const expectedOgTitle = registeredPage.ogTitle ?? registeredPage.title;
      const expectedOgDescription = registeredPage.ogDescription ?? registeredPage.description;
      const expectedImage = new URL(registeredPage.ogImage, publicDomain).toString();
      const ogTitle = metaContent(text, "property", "og:title");
      const ogDescription = metaContent(text, "property", "og:description");
      const ogUrl = metaContent(text, "property", "og:url");
      const ogImage = metaContent(text, "property", "og:image");
      const twitterTitle = metaContent(text, "name", "twitter:title");
      const twitterDescription = metaContent(text, "name", "twitter:description");
      const twitterImage = metaContent(text, "name", "twitter:image");

      if (ogTitle !== expectedOgTitle) errors.push(`og:title does not match site-data in ${rel}`);
      if (ogDescription !== expectedOgDescription) errors.push(`og:description does not match site-data in ${rel}`);
      if (ogUrl !== expectedCanonical) errors.push(`og:url does not match site-data in ${rel}: ${ogUrl}`);
      if (ogImage !== expectedImage) errors.push(`og:image does not match site-data in ${rel}: ${ogImage}`);
      if (twitterTitle !== expectedOgTitle) errors.push(`twitter:title does not match site-data in ${rel}`);
      if (twitterDescription !== expectedOgDescription) errors.push(`twitter:description does not match site-data in ${rel}`);
      if (twitterImage !== expectedImage) errors.push(`twitter:image does not match site-data in ${rel}: ${twitterImage}`);
    } else if (rel !== "404.html") {
      errors.push(`HTML page is missing from scripts/site-data.mjs: ${rel}`);
    }

    const jsonLdBlocks = text.matchAll(/<script type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi);
    for (const block of jsonLdBlocks) {
      try {
        const parsed = JSON.parse(block[1]);
        const forbiddenFields = collectForbiddenStructuredDataFields(parsed);
        for (const fieldPath of forbiddenFields) {
          errors.push(`JSON-LD exposes private/contact location field in ${rel}: ${fieldPath}`);
        }
        const parsedText = JSON.stringify(parsed);
        if (registeredPage && !parsedText.includes(`"dateModified":"${reviewedOn.iso}"`)) {
          errors.push(`JSON-LD dateModified is not synced in ${rel}`);
        }
      } catch (error) {
        errors.push(`Invalid JSON-LD in ${displayPath(file)}: ${error.message}`);
      }
    }

    let highPriorityImageCount = 0;
    const imgTags = text.matchAll(/<img\b[^>]*>/gi);
    for (const tagMatch of imgTags) {
      const tag = tagMatch[0];
      const hasSrc = /\bsrc=["'][^"']+["']/i.test(tag);
      const isLightboxPlaceholder = /\bdata-lightbox-image\b/i.test(tag);
      const hasLazyLoading = /\bloading=["']lazy["']/i.test(tag);
      const hasHighPriority = /\bfetchpriority=["']high["']/i.test(tag);

      if (!/\bwidth=["']?\d+/i.test(tag) || !/\bheight=["']?\d+/i.test(tag)) {
        errors.push(`Image tag is missing explicit width/height in ${displayPath(file)}: ${tag.slice(0, 120)}...`);
      }
      if (!/\balt=["'][^"']*["']/i.test(tag)) {
        errors.push(`Image tag is missing alt text in ${displayPath(file)}: ${tag.slice(0, 120)}...`);
      }
      if (!hasSrc && !isLightboxPlaceholder) {
        errors.push(`Image tag is missing src in ${displayPath(file)}: ${tag.slice(0, 120)}...`);
      }
      if (hasSrc && !/\bdecoding=["']async["']/i.test(tag)) {
        errors.push(`Image tag is missing decoding="async" in ${displayPath(file)}: ${tag.slice(0, 120)}...`);
      }
      if (hasSrc && hasHighPriority && hasLazyLoading) {
        errors.push(`Image tag should not combine fetchpriority="high" with loading="lazy" in ${displayPath(file)}: ${tag.slice(0, 120)}...`);
      }
      if (hasSrc && !hasHighPriority && !hasLazyLoading) {
        errors.push(`Non-priority image is missing loading="lazy" in ${displayPath(file)}: ${tag.slice(0, 120)}...`);
      }
      if (hasHighPriority) {
        highPriorityImageCount += 1;
      }
    }

    if (highPriorityImageCount > 1) {
      errors.push(`HTML page has more than one fetchpriority="high" image in ${displayPath(file)}.`);
    }

    const blankTargets = text.matchAll(/<a\b[^>]*\btarget=["']_blank["'][^>]*>/gi);
    for (const tagMatch of blankTargets) {
      const tag = tagMatch[0];
      const rel = tag.match(/\brel=["']([^"']*)["']/i)?.[1] ?? "";
      const relTokens = new Set(rel.toLowerCase().split(/\s+/).filter(Boolean));
      if (!relTokens.has("noopener") || !relTokens.has("noreferrer")) {
        errors.push(`target="_blank" link is missing rel="noopener noreferrer" in ${displayPath(file)}: ${tag.slice(0, 140)}...`);
      }
    }
  }

  const freshnessDates = text.matchAll(/\b(?:Last reviewed|checked(?: on)?|last checked)\s+([A-Z][a-z]+ \d{1,2}, \d{4})/g);
  for (const match of freshnessDates) {
    const parsed = Date.parse(`${match[1]} 00:00:00 GMT`);
    if (!Number.isNaN(parsed)) {
      const daysOld = Math.floor((Date.now() - parsed) / 86_400_000);
      if (daysOld > staleDateWarningDays) {
        warnings.push(`Freshness date may need review in ${displayPath(file)}: ${match[0]}`);
      }
    }
  }

  for (const [ref, target] of collectReferences(file, text)) {
    if (ref.includes("assets/images/") && isPropertyImage(ref) && !imageRegistryKeys.has(imageKey(ref))) {
      errors.push(`Property image reference is missing from public image registry in ${displayPath(file)}: ${ref}`);
    }
    try {
      const targetStat = await stat(target);
      if (targetStat.isDirectory()) {
        const indexStat = await stat(path.join(target, "index.html")).catch(() => null);
        if (!indexStat?.isFile()) errors.push(`Reference is not a file or page folder in ${displayPath(file)}: ${ref}`);
      } else if (!targetStat.isFile()) {
        errors.push(`Reference is not a file in ${displayPath(file)}: ${ref}`);
      }
    } catch {
      errors.push(`Broken local reference in ${displayPath(file)}: ${ref}`);
    }
  }
}

const sitemap = await readFile(path.join(root, "sitemap.xml"), "utf8");
if (!sitemap.includes("<urlset") || !sitemap.includes("</urlset>")) {
  errors.push("sitemap.xml does not look like a complete sitemap.");
}

function sitemapBlockFor(loc) {
  return sitemap.match(new RegExp(`<url>\\s*<loc>${escapeRegExp(loc)}<\\/loc>[\\s\\S]*?<\\/url>`, "m"))?.[0] || "";
}

if (totalImageBytes > totalImageWarningBytes) {
  warnings.push(`Total public image payload is ${Math.round(totalImageBytes / 1024 / 1024)} MB; target is 25-35 MB before final public launch.`);
}

for (const rel of ["robots.txt", "sitemap.xml", "index.html"]) {
  const text = await readFile(path.join(root, rel), "utf8");
  if (!text.includes(publicDomain)) {
    warnings.push(`${rel} does not include configured public domain ${publicDomain}`);
  }
}

const manifestText = await readFile(path.join(root, "site.webmanifest"), "utf8");
try {
  const manifest = JSON.parse(manifestText);
  if (manifest.start_url !== expectedManifestBase) {
    errors.push(`site.webmanifest start_url must match the public base path: expected ${expectedManifestBase}, found ${manifest.start_url}`);
  }
  if (manifest.scope !== expectedManifestBase) {
    errors.push(`site.webmanifest scope must match the public base path: expected ${expectedManifestBase}, found ${manifest.scope}`);
  }
  if (!manifest.name || !manifest.short_name || !manifest.display) {
    errors.push("site.webmanifest is missing name, short_name, or display.");
  }
  if (!Array.isArray(manifest.icons) || manifest.icons.length === 0) {
    errors.push("site.webmanifest must include at least one icon.");
  } else {
    for (const icon of manifest.icons) {
      if (!icon.src || !icon.sizes || !icon.type) {
        errors.push(`site.webmanifest icon is missing src, sizes, or type: ${JSON.stringify(icon)}`);
        continue;
      }
      const iconTarget = localTarget(path.join(root, "site.webmanifest"), icon.src);
      if (!iconTarget || !isInsideRoot(iconTarget)) {
        errors.push(`site.webmanifest icon is not a local public asset: ${icon.src}`);
        continue;
      }
      try {
        const iconStat = await stat(iconTarget);
        if (!iconStat.isFile()) errors.push(`site.webmanifest icon is not a file: ${icon.src}`);
      } catch {
        errors.push(`site.webmanifest icon reference is broken: ${icon.src}`);
      }
    }
  }
} catch (error) {
  errors.push(`site.webmanifest is not valid JSON: ${error.message}`);
}

const htmlPages = files
  .filter((file) => path.extname(file).toLowerCase() === ".html")
  .map((file) => displayPath(file))
  .filter((rel) => rel !== "404.html")
  .sort();

const sitemapPages = Array.from(sitemap.matchAll(/<loc>(https?:\/\/[^<]+)<\/loc>/g))
  .filter((match) => match[1].startsWith(publicDomain))
  .map((match) => {
    const url = new URL(match[1]);
    let pathname = url.pathname;
    if (publicBasePath && pathname.startsWith(`${publicBasePath}/`)) {
      pathname = pathname.slice(publicBasePath.length);
    }
    if (pathname === "/") return "index.html";
    if (pathname.endsWith("/")) return `${pathname.slice(1)}index.html`;
    return pathname.slice(1);
  })
  .filter((rel) => rel.endsWith(".html"))
  .sort();

for (const page of htmlPages) {
  if (!sitemapPages.includes(page)) {
    errors.push(`HTML page is missing from sitemap.xml: ${page}`);
  }
}

for (const page of sitemapPages) {
  if (!htmlPages.includes(page)) {
    errors.push(`sitemap.xml points to a missing HTML page: ${page}`);
  }
}

const registeredHtmlPages = registeredPages.map((page) => page.file).sort();
for (const page of registeredHtmlPages) {
  if (!htmlPages.includes(page)) {
    errors.push(`scripts/site-data.mjs points to a missing HTML page: ${page}`);
  }
}

for (const page of registeredPages) {
  const pageUrl = new URL(page.path, publicDomain).toString();
  const block = sitemapBlockFor(pageUrl);
  if (!block) {
    errors.push(`sitemap.xml is missing registered page URL: ${pageUrl}`);
    continue;
  }
  if (!block.includes(`<lastmod>${reviewedOn.iso}</lastmod>`)) {
    errors.push(`sitemap.xml lastmod is not synced for ${page.file}`);
  }
  const expectedImage = new URL(page.ogImage, publicDomain).toString();
  if (!block.includes(`<image:loc>${expectedImage}</image:loc>`)) {
    errors.push(`sitemap.xml is missing registered og:image for ${page.file}: ${expectedImage}`);
  }
}

for (const page of htmlPages) {
  if (page !== "404.html" && !registeredHtmlPages.includes(page)) {
    errors.push(`HTML page is not registered in scripts/site-data.mjs: ${page}`);
  }
}

for (const [title, titlePages] of seenTitles) {
  if (titlePages.length > 1) warnings.push(`Duplicate title "${title}" used by: ${titlePages.join(", ")}`);
}

for (const [description, descriptionPages] of seenDescriptions) {
  if (descriptionPages.length > 1) warnings.push(`Duplicate meta description used by: ${descriptionPages.join(", ")}`);
}

for (const image of propertyImageRegistry) {
  const imagePath = path.join(root, image.file);
  try {
    const imageStat = await stat(imagePath);
    if (!imageStat.isFile()) errors.push(`Property image registry entry is not a file: ${image.file}`);
  } catch {
    errors.push(`Property image registry points to missing file: ${image.file}`);
  }
  if (!image.status || !image.sourceCategory || !image.use) {
    errors.push(`Property image registry entry is missing public-safe governance fields: ${image.file}`);
  }
}

const registeredPageFiles = new Set(registeredPages.map((page) => page.file));
const sourceIds = new Set();
for (const source of officialSources) {
  for (const field of ["id", "name", "url", "sourceType", "topic", "claims", "volatility", "nextReview"]) {
    if (!source[field]) errors.push(`Official source is missing ${field}: ${source.name ?? "(unnamed source)"}`);
  }
  if (source.id) {
    if (sourceIds.has(source.id)) errors.push(`Duplicate official source id: ${source.id}`);
    sourceIds.add(source.id);
  }
  try {
    new URL(source.url);
  } catch {
    errors.push(`Official source has invalid URL: ${source.name}`);
  }
  if (!Array.isArray(source.pages) || source.pages.length === 0) {
    errors.push(`Official source has no page coverage: ${source.name}`);
  } else {
    for (const page of source.pages) {
      if (!registeredPageFiles.has(page)) errors.push(`Official source references unknown page ${page}: ${source.name}`);
    }
  }
}

const sourceLedgerCsv = await readFile(path.join(root, "SOURCE_LEDGER.csv"), "utf8").catch(() => "");
const sourceLedgerMd = await readFile(path.join(root, "SOURCE_LEDGER.md"), "utf8").catch(() => "");
for (const source of officialSources) {
  if (!sourceLedgerCsv.includes(source.id) || !sourceLedgerMd.includes(source.id)) {
    errors.push(`Generated source ledger is missing official source id: ${source.id}`);
  }
}

for (const [file, text] of htmlTexts) {
  const anchorLinks = text.matchAll(/\bhref=["']([^"']*#[^"']+)["']/gi);
  for (const match of anchorLinks) {
    const rawHref = match[1];
    if (/^(mailto:|tel:|javascript:|data:)/i.test(rawHref)) continue;
    if (/^https?:\/\//i.test(rawHref) && !rawHref.startsWith(publicDomain)) continue;

    const [base, fragment] = rawHref.split("#");
    if (!fragment) continue;

    let targetFile = base ? localTarget(file, base) : file;
    if (!targetFile || !isInsideRoot(targetFile)) continue;

    try {
      const targetStat = await stat(targetFile);
      if (targetStat.isDirectory()) targetFile = path.join(targetFile, "index.html");
    } catch {
      continue;
    }

    const targetText = htmlTexts.get(targetFile) ?? await readFile(targetFile, "utf8").catch(() => "");
    const targetIds = new Set(Array.from(targetText.matchAll(/\bid=["']([^"']+)["']/gi)).map((idMatch) => idMatch[1]));
    if (!targetIds.has(decodeURIComponent(fragment))) {
      errors.push(`Broken local anchor in ${displayPath(file)}: ${rawHref}`);
    }
  }
}

console.log(`Checked ${files.length} files in the public site package.`);
if (warnings.length) {
  console.log("\nWarnings:");
  for (const warning of warnings) console.log(`- ${warning}`);
}

if (errors.length) {
  console.error("\nBuild validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Build validation passed.");
