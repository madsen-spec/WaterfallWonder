# Waterfall Wonder Public Content Sources

Governance model updated: July 22, 2026

This file tracks the public-safe sources used for visible website claims, images, review excerpts, and booking links. It is a maintenance aid for the public website package; it does not publish an exact address, coordinates, owner/vendor records, financial data, internal notes, or private workspace material.

The structured source and claim ledger is generated from `scripts/site-data.mjs` into `SOURCE_LEDGER.md` and `SOURCE_LEDGER.csv`. Dates are claim/source-specific. The July 22 governance date above records the latest model change; it does **not** mean that every external source or public claim was rechecked on July 22.

`lastCheckedOn` records that someone attempted a check. Advance `lastVerifiedOn` only when the exact claim in that evidence row was confirmed. A failed, blocked, or unreadable check must preserve the prior verification date and use `recheck-required` or `blocked` status.

Owner-confirmed facts use the separate `owner-confirmed` claim status with `ownerConfirmedOn` and an owner-confirmation note. Owner confirmation does not advance an external source's `lastVerifiedOn` date.

## Property And Booking Sources

- Direct booking: https://www.gowanderhome.com/pocono-cabin-rentals/waterfall-wonder-(poconos) checked July 16, 2026 for the live booking destination, booking controls, 12-guest maximum, current sleeping narrative, core amenities, and visible dog-fee statement. No price or availability was copied.
- Airbnb listing: https://www.airbnb.com/rooms/1322697503906414464 checked July 16, 2026 for the public rating/count, 12-guest maximum, 4-bedroom/7-bed/3-bath display, core amenities, pet terms, community wording, and conservative waterfall-access language.
- Vrbo listing: https://www.vrbo.com/4388577 checked July 16, 2026 for the public rating/count, sleeps-12/4-bedroom/3-bath display, pet terms, rental-agreement language, and Saw Creek registration/pass wording. The site continues to avoid an exact Vrbo review-count claim.
- Instagram: https://www.instagram.com/winonafalls/

## Review Sources

- Airbnb rating and count were checked on July 16, 2026: 5.0 from 57 reviews.
- Vrbo displayed 9.8 from 158 reviews on July 16, 2026. The public site avoids an exact Vrbo review-count claim because platform totals can vary by surface.
- No individual review excerpts are published. The owner directed the July 22 implementation to keep them omitted. A future change would require a traceable platform capture or separate approval of the exact quoted text. Do not add review schema unless the visible page content and source records support it.

## Property Photos

- Property images in `assets/images/` are public optimized copies prepared for the website from owner-provided Waterfall Wonder photo materials.
- The homepage night showcase uses owned property-photo derivatives, including `firepit-dusk-cabin-*`, `exterior-dusk-side-*`, and `deck-fire-table-dusk-*`.
- The homepage night showcase also uses owned nighttime waterfall derivatives; public copy should describe these as ground lights, natural terrain, and waterfall views, not as a maintained trail or guaranteed access route.
- Source originals should remain outside the public repository.
- On July 22, 2026, the owner confirmed that every current property image used in hero, gallery, carousel, Open Graph, and sitemap entries is approved for public use. Future property images require their own approval before publication.
- Current property-photo source-of-truth: owner-provided property photos and the private local property-photo review index outside this public package. The room/sleeping layout page uses existing public derivatives traced to that source set; source originals remain outside the public repository.
- `scripts/site-data.mjs` contains the public-safe property image registry and dated owner-approval fields used by validation. Public pages should not use property-representing images unless they are covered by that registry with approval recorded.

## National Park Service Images

- Dingmans Falls image files: `nps-dingmans-falls-*`
- Raymondskill Falls image files: `nps-raymondskill-falls-*`
- Captions in the guide pages and sitemap identify the National Park Service photo credit shown on the public page.
- Relevant official sources:
  - Delaware Water Gap current conditions: https://www.nps.gov/dewa/planyourvisit/conditions.htm
  - Dingmans Falls: https://www.nps.gov/places/dingmans-falls.htm
  - Raymondskill Falls: https://www.nps.gov/places/raymondskill-falls.htm
- July 16, 2026 source check: NPS current conditions, last updated May 21, 2026, still listed the Dingmans Falls access road, visitor center, and trail as closed for bridge replacement and trail rehabilitation. NPS also listed the annual May 1-September 30 lower Raymondskill Creek drainage closure and expressly excluded the Raymondskill Falls Trail from that seasonal closure. Recheck current conditions before every recommendation.

## Attraction And Guide Sources

- Public guide pages should use official attraction websites and official map links where practical.
- July 16, 2026 checks verified the limited claim scopes recorded in the ledger for Bushkill Falls, Shawnee Mountain, Aquatopia, Great Wolf Lodge Poconos day passes, Kalahari Poconos day passes, PEEC, Pocono Indian Museum, ShawneeCraft, Mountain View Vineyard, and Mount Airy Casino Resort.
- Camelback's conditions page returned no readable conditions content in the automated check. Its prior verification date remains May 17, 2026 and its status is `recheck-required` before an in-season recommendation.
- Sango Kura's recorded official URL redirected to a hosting-account suspended page. Its prior verification date remains May 17, 2026, its status is `blocked`, and it must not appear as a current public recommendation without an owner-approved primary source.
- Do not hard-code volatile prices, exact operating hours, annual event dates, or closure-sensitive claims unless they are reviewed and dated.
- The owner authorized a fresh address-safe route check on July 22, 2026, but that check has not yet been completed. Numerical drive-time estimates remain withheld; use qualitative outing labels and direct guests to current route information without publishing the address or coordinates.

## Do Not Publish

- Exact property address or coordinates.
- Owner, vendor, financial, maintenance, or spreadsheet data.
- Amenity fob counts, internal registration records, disputes, or unresolved checkout claims.
- Third-party images unless licensing or public-use rights are confirmed.
- Source-photo folders, private indexes, rollback folders, QA screenshots, or local workspace paths.
