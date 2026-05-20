# Waterfall Wonder Public Content Sources

Last updated: May 17, 2026

This file tracks the public-safe sources used for visible website claims, images, review excerpts, and booking links. It is a maintenance aid for the public website package; it does not publish an exact address, coordinates, owner/vendor records, financial data, internal notes, or private workspace material.

The structured source ledger is generated from `scripts/site-data.mjs` into `SOURCE_LEDGER.md` and `SOURCE_LEDGER.csv`. Update `scripts/site-data.mjs` first when adding or changing official sources, source-sensitive claims, review dates, or source volatility.

## Property And Booking Sources

- Direct booking: https://www.gowanderhome.com/pocono-cabin-rentals/waterfall-wonder-(poconos) checked May 17, 2026 for public booking, amenities, room, dog, vehicle, and guest-policy content.
- Airbnb listing: https://www.airbnb.com/rooms/1322697503906414464 checked May 17, 2026 for public rating/count, occupancy, bed/bath display, house rules, pet rules, Saw Creek notes, safety/property markers, and camera/body-of-water disclosures.
- Vrbo listing: https://www.vrbo.com/4388577 checked May 17, 2026 for public rule language, rental agreement timing, occupancy, dog fee/approval notes, Saw Creek registration, amenity-pass notes, winter-road guidance, and burn-ban language.
- Instagram: https://www.instagram.com/winonafalls/

## Review Sources

- Airbnb rating and count were checked on May 17, 2026: 5.0 from 52 reviews.
- Vrbo public listing/rule content was checked on May 17, 2026. Because Vrbo review-count displays can vary by surface and were not consistently exposed in the text view used for this pass, the public site avoids a brittle exact Vrbo review-count claim.
- Review excerpts on the homepage should remain visible, short, source-labeled, and conservative. Do not add review schema unless the visible page content and source records support it.

## Property Photos

- Property images in `assets/images/` are public optimized copies prepared for the website from owner-provided Waterfall Wonder photo materials.
- The homepage night showcase uses owned property-photo derivatives, including `firepit-dusk-cabin-*`, `exterior-dusk-side-*`, and `deck-fire-table-dusk-*`.
- The homepage night showcase also uses owned nighttime waterfall derivatives; public copy should describe these as ground lights, natural terrain, and waterfall views, not as a maintained trail or guaranteed access route.
- Source originals should remain outside the public repository.
- Before public launch, confirm owner approval for all property photos used in hero, gallery, carousel, Open Graph, and sitemap image entries.
- Current property-photo source-of-truth: owner-provided property photos and the private local property-photo review index outside this public package. The room/sleeping layout page uses existing public derivatives traced to that source set; source originals remain outside the public repository.
- `scripts/site-data.mjs` contains the public-safe property image registry used by validation. Public pages should not use property-representing images unless they are covered by that registry or intentionally marked for owner review.

## National Park Service Images

- Dingmans Falls image files: `nps-dingmans-falls-*`
- Raymondskill Falls image files: `nps-raymondskill-falls-*`
- Captions in the guide pages and sitemap identify the National Park Service photo credit shown on the public page.
- Relevant official sources:
  - Delaware Water Gap current conditions: https://www.nps.gov/dewa/planyourvisit/conditions.htm
  - Dingmans Falls: https://www.nps.gov/places/dingmans-falls.htm
  - Raymondskill Falls: https://www.nps.gov/places/raymondskill-falls.htm
- May 17, 2026 source refresh: NPS current conditions still listed Dingmans Falls access road, visitor center, and trail closures for bridge replacement/trail rehabilitation; Raymondskill planning should also check current conditions for lower-creek area restrictions and parking/trail status.

## Attraction And Guide Sources

- Public guide pages should use official attraction websites and official map links where practical.
- May 17, 2026 source refresh used official/current sources for Bushkill Falls, Shawnee Mountain, Camelback conditions/Aquatopia, Great Wolf Lodge Poconos day passes, Kalahari Poconos day passes, PEEC, Pocono Indian Museum, ShawneeCraft, Sango Kura, Mountain View Vineyard, and Mount Airy Casino Resort.
- Do not hard-code volatile prices, exact operating hours, annual event dates, or closure-sensitive claims unless they are reviewed and dated.
- Drive-time language should stay approximate and address-safe, using rounded bands from the Winona Falls / Bushkill-side area.

## Do Not Publish

- Exact property address or coordinates.
- Owner, vendor, financial, maintenance, or spreadsheet data.
- Amenity fob counts, internal registration records, disputes, or unresolved checkout claims.
- Third-party images unless licensing or public-use rights are confirmed.
- Source-photo folders, private indexes, rollback folders, QA screenshots, or local workspace paths.
