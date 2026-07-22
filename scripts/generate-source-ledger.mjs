import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { claimRegistry, officialSources, registryUpdatedOn } from "./site-data.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceById = new Map(officialSources.map((source) => [source.id, source]));

function csvCell(value) {
  const text = Array.isArray(value) ? value.join("; ") : String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function markdownLinkUrl(url) {
  return `<${String(url).replaceAll(">", "%3E")}>`;
}

function markdownCell(value) {
  return String(value ?? "")
    .replaceAll("|", "\\|")
    .replaceAll("\r", " ")
    .replaceAll("\n", " ");
}

const fields = [
  "claimId",
  "stability",
  "claimStatus",
  "claim",
  "publicValue",
  "sourceId",
  "sourceName",
  "sourceUrl",
  "evidenceStatus",
  "lastCheckedOn",
  "lastVerifiedOn",
  "ownerConfirmedOn",
  "ownerConfirmationNote",
  "cadence",
  "owner",
  "pages",
  "verificationNote"
];

const claimEvidenceRows = claimRegistry.flatMap((claim) => {
  const evidenceRows = claim.evidence.length ? claim.evidence : [null];
  const ownerConfirmed = claim.status === "owner-confirmed" && claim.ownerConfirmedOn;
  return evidenceRows.map((evidence) => {
    const source = evidence ? sourceById.get(evidence.sourceId) : null;
    return {
      claimId: claim.id,
      stability: claim.stability,
      claimStatus: claim.status,
      claim: claim.claim,
      publicValue: claim.publicValue,
      sourceId: evidence?.sourceId ?? "",
      sourceName: source?.name ?? "",
      sourceUrl: source?.url ?? "",
      evidenceStatus: evidence?.status ?? (ownerConfirmed ? "owner-confirmed" : claim.status),
      lastCheckedOn: evidence?.lastCheckedOn ?? "",
      lastVerifiedOn: evidence?.lastVerifiedOn ?? "",
      ownerConfirmedOn: ownerConfirmed ? claim.ownerConfirmedOn : "",
      ownerConfirmationNote: ownerConfirmed ? claim.ownerConfirmationNote : "",
      cadence: claim.cadence,
      owner: claim.owner,
      pages: claim.pages,
      verificationNote: evidence?.note ?? (ownerConfirmed
        ? "No external-source evidence row; owner confirmation is recorded in its dedicated fields."
        : "Owner confirmation required; no external-source date is asserted.")
    };
  });
});

const csvRows = [
  fields.map(csvCell).join(","),
  ...claimEvidenceRows.map((row) => fields.map((field) => csvCell(row[field])).join(","))
];

const sourceRows = officialSources.map((source) =>
  `| ${source.id} | [${markdownCell(source.name)}](${markdownLinkUrl(source.url)}) | ${markdownCell(source.sourceType)} | ${source.verificationStatus} | ${source.lastCheckedOn} | ${source.lastVerifiedOn} | ${markdownCell(source.verificationNote)} | ${markdownCell(source.nextReview)} |`
);

const claimRows = claimRegistry.map((claim) => {
  const ownerConfirmed = claim.status === "owner-confirmed" && claim.ownerConfirmedOn;
  const sources = claim.evidence.length
    ? claim.evidence.map((evidence) => evidence.sourceId).join("<br>")
    : "No external source";
  const dates = claim.evidence.length
    ? claim.evidence.map((evidence) => `${evidence.sourceId}: ${evidence.lastVerifiedOn || "not verified"} (${evidence.status})`).join("<br>")
    : "No external verification asserted";
  const ownerConfirmation = ownerConfirmed
    ? `${claim.ownerConfirmedOn}: ${markdownCell(claim.ownerConfirmationNote)}`
    : "Not applicable";
  return `| ${claim.id} | ${claim.stability} | ${claim.status} | ${markdownCell(claim.claim)}<br>**Public treatment:** ${markdownCell(claim.publicValue)} | ${sources} | ${dates} | ${ownerConfirmation} | ${markdownCell(claim.cadence)} | ${markdownCell(claim.owner)} | ${claim.pages.join("<br>")} |`;
});

const markdown = [
  "# Waterfall Wonder Source and Claim Ledger",
  "",
  `Registry schema updated: ${registryUpdatedOn.label}. This is a governance-maintenance date, not a site-wide claim-verification date.`,
  "",
  "Generated from `scripts/site-data.mjs`. Every external verification date below belongs to a specific source or claim/source evidence row. `lastCheckedOn` records an attempt; it does not advance `lastVerifiedOn` unless the stated claim was actually confirmed.",
  "",
  "Owner-confirmation dates are recorded separately and do not advance an external source's verification date.",
  "",
  "This ledger is public-safe. It excludes exact property address, coordinates, owner/vendor records, financial data, internal workspace paths, and private owner materials.",
  "",
  "## Official source status",
  "",
  "| ID | Source | Type | Status | Last checked | Last verified | Verified scope / result | Next review |",
  "|---|---|---|---|---|---|---|---|",
  ...sourceRows,
  "",
  "## Claim registry",
  "",
  "| Claim ID | Class | Status | Claim and public treatment | External source(s) | Last verified by source | Owner confirmation | Cadence | Owner | Pages |",
  "|---|---|---|---|---|---|---|---|---|---|",
  ...claimRows,
  ""
];

await writeFile(path.join(root, "SOURCE_LEDGER.csv"), `${csvRows.join("\n")}\n`, "utf8");
await writeFile(path.join(root, "SOURCE_LEDGER.md"), markdown.join("\n"), "utf8");

console.log(`Generated ${officialSources.length} source entries and ${claimEvidenceRows.length} claim/source rows.`);
