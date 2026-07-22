import { cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pages } from "./site-data.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.resolve(root, "dist");

if (path.dirname(output) !== root || path.basename(output) !== "dist") {
  throw new Error(`Refusing to replace an unexpected deployment directory: ${output}`);
}

const publicFiles = [
  ...pages.map((page) => page.file),
  "404.html",
  "_headers",
  "favicon.svg",
  "robots.txt",
  "script.js",
  "site.webmanifest",
  "sitemap.xml",
  "styles.css"
];

function targetPath(relativePath) {
  const target = path.resolve(output, relativePath);
  const relation = path.relative(output, target);
  if (relation.startsWith("..") || path.isAbsolute(relation)) {
    throw new Error(`Deployment path escapes dist: ${relativePath}`);
  }
  return target;
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const relativePath of publicFiles) {
  const source = path.resolve(root, relativePath);
  const sourceStat = await stat(source).catch(() => null);
  if (!sourceStat?.isFile()) throw new Error(`Missing public deployment file: ${relativePath}`);
  const target = targetPath(relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await cp(source, target);
}

await cp(path.join(root, "assets"), targetPath("assets"), { recursive: true });

async function listFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = path.join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(path.join(directory, entry.name), relativePath));
    } else if (entry.isFile()) {
      files.push(relativePath.replaceAll("\\", "/"));
    }
  }
  return files;
}

const deployedFiles = await listFiles(output);
const forbiddenRoots = [".git/", ".github/", "content/", "scripts/", "node_modules/"];
const forbiddenFiles = new Set([
  "CONTENT_SOURCES.md",
  "MAINTENANCE_CHECKLIST.md",
  "README.md",
  "SOURCE_LEDGER.csv",
  "SOURCE_LEDGER.md",
  "Start Visual Copy Editor.cmd",
  "package.json"
]);
const leakedFiles = deployedFiles.filter((file) =>
  forbiddenRoots.some((prefix) => file.startsWith(prefix)) || forbiddenFiles.has(file)
);

if (leakedFiles.length) {
  throw new Error(`Source-only files leaked into dist: ${leakedFiles.join(", ")}`);
}

console.log(`Cloudflare deployment package ready: ${deployedFiles.length} public files in dist.`);
