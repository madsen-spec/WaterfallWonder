import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDomain = "https://waterfallwonderpoconos.com/";
const publicHost = new URL(publicDomain).hostname;
const textExtensions = new Set([".html", ".css", ".js", ".json", ".svg", ".xml", ".txt", ".md", ".webmanifest"]);
const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"]);
const requiredFiles = [
  "index.html",
  "404.html",
  "styles.css",
  "script.js",
  "robots.txt",
  "sitemap.xml",
  ".nojekyll",
  "CNAME",
  "CONTENT_SOURCES.md",
  "MAINTENANCE_CHECKLIST.md"
];
const forbiddenEntries = ["node_modules", ".env", ".env.local", ".env.production", "secrets", "credentials"];
const sensitivePattern = /(api[_-]?key|client[_-]?secret|password|passwd|private key|begin rsa|begin openssh|github_pat_|ghp_|sk_live|aws_secret|smtp_password)/i;
const oversizedImageBytes = 800 * 1024;
const totalImageWarningBytes = 35 * 1024 * 1024;
const staleDateWarningDays = 60;

const errors = [];
const warnings = [];
const htmlTexts = new Map();

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
  if (clean.startsWith("/")) return path.join(root, clean);
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

  const absoluteAsset = /https:\/\/waterfallwonderpoconos\.com\/(assets\/images\/[^"<\s]+)/g;
  for (const match of text.matchAll(absoluteAsset)) refs.push(`${publicDomain}${match[1]}`);

  return refs
    .map((ref) => [ref, localTarget(filePath, ref)])
    .filter(([, target]) => target && target.startsWith(root));
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

  if (extension === ".html") {
    htmlTexts.set(file, text);

    const jsonLdBlocks = text.matchAll(/<script type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi);
    for (const block of jsonLdBlocks) {
      try {
        JSON.parse(block[1]);
      } catch (error) {
        errors.push(`Invalid JSON-LD in ${displayPath(file)}: ${error.message}`);
      }
    }

    const imgTags = text.matchAll(/<img\b[^>]*>/gi);
    for (const tagMatch of imgTags) {
      const tag = tagMatch[0];
      if (!/\bwidth=["']?\d+/i.test(tag) || !/\bheight=["']?\d+/i.test(tag)) {
        errors.push(`Image tag is missing explicit width/height in ${displayPath(file)}: ${tag.slice(0, 120)}...`);
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

if (totalImageBytes > totalImageWarningBytes) {
  warnings.push(`Total public image payload is ${Math.round(totalImageBytes / 1024 / 1024)} MB; target is 25-35 MB before final public launch.`);
}

const cname = (await readFile(path.join(root, "CNAME"), "utf8")).trim();
if (cname && cname !== publicHost) {
  errors.push(`CNAME (${cname}) does not match configured public domain host (${publicHost}).`);
}

for (const rel of ["robots.txt", "sitemap.xml", "index.html"]) {
  const text = await readFile(path.join(root, rel), "utf8");
  if (!text.includes(publicDomain)) {
    warnings.push(`${rel} does not include configured public domain ${publicDomain}`);
  }
}

const htmlPages = files
  .filter((file) => path.extname(file).toLowerCase() === ".html")
  .map((file) => displayPath(file))
  .filter((rel) => rel !== "404.html")
  .sort();

const sitemapPages = Array.from(sitemap.matchAll(/<loc>(https:\/\/waterfallwonderpoconos\.com\/[^<]*)<\/loc>/g))
  .map((match) => {
    const url = new URL(match[1]);
    if (url.pathname === "/") return "index.html";
    if (url.pathname.endsWith("/")) return `${url.pathname.slice(1)}index.html`;
    return url.pathname.slice(1);
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

for (const [file, text] of htmlTexts) {
  const anchorLinks = text.matchAll(/\bhref=["']([^"']*#[^"']+)["']/gi);
  for (const match of anchorLinks) {
    const rawHref = match[1];
    if (/^(mailto:|tel:|javascript:|data:)/i.test(rawHref)) continue;
    if (/^https?:\/\//i.test(rawHref) && !rawHref.startsWith(publicDomain)) continue;

    const [base, fragment] = rawHref.split("#");
    if (!fragment) continue;

    let targetFile = base ? localTarget(file, base) : file;
    if (!targetFile || !targetFile.startsWith(root)) continue;

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
