# Waterfall Wonder Monthly Website Checklist

Use this before public launch and then monthly during active booking season.

## Truth And Freshness Controls

- Work claim by claim in `scripts/site-data.mjs`; never treat a general maintenance date as evidence that all public facts were reviewed.
- Keep `contentModifiedOn` page-specific. It records the base material page edit for structured data and the sitemap; a later governed Visual Copy Editor revision becomes the effective modified date. Neither date is a source-verification date.
- Record each source attempt in `lastCheckedOn`. Advance `lastVerifiedOn` only when the exact claim in that evidence row was confirmed.
- If a source is unavailable, suspended, unreadable, contradictory, or insufficient, preserve the prior `lastVerifiedOn` date and set the evidence to `recheck-required` or `blocked`.
- Every volatile claim must retain a source, verification date, cadence, owner, page coverage, and concise verification note.
- Keep owner-only questions and answers in the internal owner-review file outside the deployable public package. Record approved facts as `owner-confirmed` claims with a confirmation date and note; do not infer beyond the recorded answer or treat owner confirmation as external-source verification.
- Regenerate `SOURCE_LEDGER.md` and `SOURCE_LEDGER.csv` after registry edits. Confirm that the CSV contains one row per claim/source evidence pair.

## Booking And Reputation

- Open WanderHome and confirm the booking URL still works.
- Check Airbnb score, review count, title, occupancy, bed count, pet notes, and major amenity claims.
- Check Vrbo score and review count displays. If counts vary by regional page, keep the public site rounded rather than exact.
- Keep individual review excerpts omitted under the July 22 owner direction. If that direction changes, confirm each exact excerpt on the source platform or obtain separate approval before publication.
- Confirm any exact fee, fob, registration, dog-limit, cancellation, or rental-agreement wording against WanderHome/Airbnb/Vrbo before publishing it.
- If platforms disagree or present a term differently, keep the public site general and send guests to the live booking page; do not choose the most favorable version.

## Local Guide Facts

- Check official attraction pages for closures, seasonal warnings, pet rules, ticketing, and parking changes.
- Check NPS Delaware Water Gap current conditions before publishing Dingmans Falls or Raymondskill Falls guidance.
- Check Shawnee tubing/session rules, Camelback lift/trail conditions, and day-pass availability for Great Wolf, Kalahari, and Aquatopia before suggesting a winter or rainy-day plan.
- Remove a recommendation when its only recorded primary source is blocked or suspended; a successful historical check is not current evidence.
- Remove or revise any page that relies on stale event dates, fixed hours, static prices, or closure-sensitive language.

## Public-Safety And Privacy

- Confirm the GitHub repository visibility, default branch, Cloudflare Pages production branch, and automatic-deployment controls are intentional before any push, merge, or release.
- Confirm a human owner has approved public exposure of the repository and website URL.
- Confirm the site does not publish exact address, coordinates, internal records, vendor data, owner records, financials, fob counts, or private spreadsheet content.
- Confirm waterfall and road guidance remains conservative and does not imply a maintained trail or guaranteed access condition.
- Confirm pet, community-registration, amenity, and checkout language points guests back to the booking page for current rules.
- Confirm no individual review/testimonial excerpt has been introduced without a traceable platform capture or separate approval of the exact quoted text.

## Assets And SEO

- For ordinary visible wording, use the local Visual Copy Editor and save all intended fields together. Treat its passing checks as structural validation, not factual or launch approval.
- After a Visual Copy Editor save, confirm any new property, policy, distance, fee, availability, amenity, review, or safety statement against the applicable claim/source record before release. Do not advance `lastVerifiedOn` through a copy edit.
- Run `npm run build`.
- Run `npm run qa:browser` before release or after layout/media changes.
- Review warnings for large images, stale visible dates, missing image dimensions, sitemap mismatches, and domain mismatches.
- Confirm `SOURCE_LEDGER.md` and `SOURCE_LEDGER.csv` regenerate from `scripts/site-data.mjs`, include every source-sensitive page, and preserve distinct checked/verified dates.
- Confirm every property-representing image used by an HTML page is listed in the public-safe image registry in `scripts/site-data.mjs` with dated owner approval for public use.
- Confirm canonical URLs, Open Graph URLs, structured data, `robots.txt`, and `sitemap.xml` all use `https://waterfall-wonder.com/`.
- Confirm Cloudflare serves the apex domain, redirects `www` to the apex through the approved Bulk Redirect and proxied placeholder DNS record, and redirects the production `pages.dev` address to the custom domain.
- Confirm the former GitHub Pages copy is disabled or redirect-only after the Cloudflare launch.
- Confirm `dist/` was freshly generated and contains no editor, governed source, project documentation, credentials, or internal workspace files.
- Confirm `scripts/site-data.mjs` is updated before editing repeated page metadata, page modification dates, claim/source evidence dates, or shared public URLs.
- Confirm Search Console is connected after public launch and resubmit the sitemap after major content changes.

## Launch Stop Conditions

- Stop if the repository or Cloudflare Pages site is public but public release has not been approved.
- Stop if any public page mentions private workspace paths, source-photo folders, exact address, coordinates, owner/vendor/financial data, or internal indexes.
- Stop if any page relies on stale or unverified hours, prices, fees, pet limits, review counts, attraction closures, amenity access, or policy language.
- Stop if a blocked claim marker remains public, a failed check advanced `lastVerifiedOn`, or a volatile claim lacks claim/source-specific evidence.
- Stop if browser QA shows text overlap, unusable mobile navigation, sticky booking-bar interference, broken images, or horizontal overflow.
