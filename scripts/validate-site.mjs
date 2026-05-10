import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDomain = "https://waterfallwonderpoconos.com/";
const textExtensions = new Set([".html", ".css", ".js", ".json", ".svg", ".xml", ".txt", ".md", ".webmanifest"]);
const requiredFiles = ["index.html", "404.html", "styles.css", "script.js", "robots.txt", "sitemap.xml"];
const forbiddenEntries = ["node_modules", ".env", ".env.local", ".env.production", "secrets", "credentials"];
const sensitivePattern = /(api[_-]?key|client[_-]?secret|password|passwd|private key|begin rsa|begin openssh|github_pat_|ghp_|sk_live|aws_secret|smtp_password)/i;

const errors = [];
const warnings = [];

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
for (const file of files) {
  const extension = path.extname(file).toLowerCase();
  if (!textExtensions.has(extension)) continue;

  const text = await readFile(file, "utf8");
  if (sensitivePattern.test(text)) {
    warnings.push(`Review possible sensitive wording in ${displayPath(file)}`);
  }

  if (extension === ".html") {
    const jsonLdBlocks = text.matchAll(/<script type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi);
    for (const block of jsonLdBlocks) {
      try {
        JSON.parse(block[1]);
      } catch (error) {
        errors.push(`Invalid JSON-LD in ${displayPath(file)}: ${error.message}`);
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
