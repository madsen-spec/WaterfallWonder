import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { officialSources, reviewedOn } from "./site-data.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function csvCell(value) {
  const text = Array.isArray(value) ? value.join("; ") : String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function markdownLinkUrl(url) {
  return `<${String(url).replaceAll(">", "%3E")}>`;
}

const fields = [
  "id",
  "name",
  "url",
  "sourceType",
  "topic",
  "claims",
  "pages",
  "volatility",
  "reviewedOn",
  "nextReview"
];

const rows = [
  fields.map(csvCell).join(","),
  ...officialSources.map((source) =>
    fields
      .map((field) => csvCell(field === "reviewedOn" ? reviewedOn.iso : source[field]))
      .join(",")
  )
];

const markdown = [
  "# Waterfall Wonder Source Ledger",
  "",
  `Generated from \`scripts/site-data.mjs\`. Last reviewed: ${reviewedOn.label}.`,
  "",
  "This ledger tracks official or platform sources used for public website claims. It is public-safe and does not include private owner files, exact address, coordinates, internal records, or workspace paths.",
  "",
  "| ID | Source | Type | Claims Supported | Pages | Volatility | Next Review |",
  "|---|---|---|---|---|---|---|",
  ...officialSources.map((source) =>
    `| ${source.id} | [${source.name}](${markdownLinkUrl(source.url)}) | ${source.sourceType} | ${source.claims} | ${source.pages.join("<br>")} | ${source.volatility} | ${source.nextReview} |`
  ),
  ""
];

await writeFile(path.join(root, "SOURCE_LEDGER.csv"), `${rows.join("\n")}\n`, "utf8");
await writeFile(path.join(root, "SOURCE_LEDGER.md"), `${markdown.join("\n")}`, "utf8");

console.log(`Generated ${officialSources.length} source-ledger entries.`);
