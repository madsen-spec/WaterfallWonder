import { readFile } from "node:fs/promises";
import {
  DEFAULT_REGISTRY_PATH,
  PUBLIC_ROOT,
  buildCopyRegistry,
  loadCopyRegistry,
  saveCopyRegistry,
  validateCopyRegistry,
} from "./visual-copy-model.mjs";

const refresh = process.argv.includes("--refresh");

if (refresh) {
  let existing = null;
  try {
    existing = JSON.parse(await readFile(DEFAULT_REGISTRY_PATH, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const registry = await buildCopyRegistry(PUBLIC_ROOT, existing);
  await saveCopyRegistry(registry, DEFAULT_REGISTRY_PATH, { rootDir: PUBLIC_ROOT, validate: true });
  console.log(`Refreshed governed visual copy for ${registry.pages.length} pages.`);
}

let registry;
try {
  registry = await loadCopyRegistry();
} catch (error) {
  console.error(`Unable to load content/visual-copy.json: ${error.message}`);
  process.exit(1);
}

const result = await validateCopyRegistry(registry, {
  rootDir: PUBLIC_ROOT,
  requireAllPages: true,
  requireApplied: true,
});

for (const warning of result.warnings) console.warn(`WARN: ${warning}`);
if (!result.valid) {
  for (const error of result.errors) console.error(`ERROR: ${error}`);
  console.error(`Visual copy validation failed with ${result.errors.length} error(s).`);
  process.exit(1);
}

console.log(
  `Visual copy valid: ${result.stats.pages} pages, ${result.stats.entries} editable fields, ${result.stats.overrides} saved override(s).`,
);
