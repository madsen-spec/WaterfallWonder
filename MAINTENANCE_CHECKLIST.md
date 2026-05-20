# Waterfall Wonder Monthly Website Checklist

Use this before public launch and then monthly during active booking season.

## Booking And Reputation

- Open WanderHome and confirm the booking URL still works.
- Check Airbnb score, review count, title, occupancy, bed count, pet notes, and major amenity claims.
- Check Vrbo score and review count displays. If counts vary by regional page, keep the public site rounded rather than exact.
- Confirm review excerpts still appear on the source platform or are otherwise approved for public use.
- Confirm any exact fee, fob, registration, dog-limit, cancellation, or rental-agreement wording against WanderHome/Airbnb/Vrbo before publishing it.

## Local Guide Facts

- Check official attraction pages for closures, seasonal warnings, pet rules, ticketing, and parking changes.
- Check NPS Delaware Water Gap current conditions before publishing Dingmans Falls or Raymondskill Falls guidance.
- Check Shawnee tubing/session rules, Camelback lift/trail conditions, and day-pass availability for Great Wolf, Kalahari, and Aquatopia before suggesting a winter or rainy-day plan.
- Remove or revise any page that relies on stale event dates, fixed hours, static prices, or closure-sensitive language.

## Public-Safety And Privacy

- Confirm the GitHub repository visibility, default branch, and GitHub Pages state are intentional before any push, merge, or release.
- Confirm a human owner has approved public exposure of the repository and website URL.
- Confirm the site does not publish exact address, coordinates, internal records, vendor data, owner records, financials, fob counts, or private spreadsheet content.
- Confirm waterfall and road guidance remains conservative and does not imply a maintained trail or guaranteed access condition.
- Confirm pet, community-registration, amenity, and checkout language points guests back to the booking page for current rules.
- Confirm review/testimonial excerpts remain visible on the cited platform or have separate owner approval.

## Assets And SEO

- Run `npm run build`.
- Run `npm run qa:browser` before release or after layout/media changes.
- Review warnings for large images, stale dates, missing image dimensions, sitemap mismatches, and domain mismatches.
- Confirm `SOURCE_LEDGER.md` and `SOURCE_LEDGER.csv` regenerate from `scripts/site-data.mjs` and include every source-sensitive page.
- Confirm every property-representing image used by an HTML page is listed in the public-safe image registry in `scripts/site-data.mjs`.
- Confirm canonical URLs, Open Graph URLs, `robots.txt`, and `sitemap.xml` all match the current public URL. Add or restore `CNAME` only when the custom domain is registered and DNS is pointed to GitHub Pages.
- Confirm `scripts/site-data.mjs` is updated before editing repeated page metadata, review dates, source-review dates, or shared public URLs.
- Confirm Search Console is connected after public launch and resubmit the sitemap after major content changes.

## Launch Stop Conditions

- Stop if the repository or Pages site is public but public release has not been approved.
- Stop if any public page mentions private workspace paths, source-photo folders, exact address, coordinates, owner/vendor/financial data, or internal indexes.
- Stop if any page relies on stale or unverified hours, prices, fees, pet limits, review counts, attraction closures, amenity access, or policy language.
- Stop if browser QA shows text overlap, unusable mobile navigation, sticky booking-bar interference, broken images, or horizontal overflow.
