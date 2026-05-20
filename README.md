# Waterfall Wonder Website

This repository contains the public website package for Waterfall Wonder, a Poconos short-term rental in Bushkill, Pennsylvania.

## Project Type

This is a plain static website. It is not Vite, React, Next.js, WordPress, or another framework.

The site is made from ordinary files:

- `index.html` for the homepage.
- Guide-page folders with their own `index.html` files.
- `styles.css` for the design.
- `script.js` for lightweight browser behavior.
- `assets/images/` for optimized public website images.
- `scripts/site-data.mjs` for shared page metadata, public URLs, review dates, source notes, and public-safe image governance.
- `SOURCE_LEDGER.md` and `SOURCE_LEDGER.csv` for the public-safe claim/source ledger generated from `scripts/site-data.mjs`.
- `robots.txt` and `sitemap.xml` for search engines.
- `404.html` for a static-hosting not-found page.
- `.nojekyll` for GitHub Pages static-file publishing.
- `CONTENT_SOURCES.md` and `MAINTENANCE_CHECKLIST.md` for public-content upkeep.

## What Is Included

This repository should contain only the public website package. Owner source photos, internal indexes, audit notes, backup versions, law-office files, and private workspace folders should stay outside this repository.

## Run Locally

If Node.js is installed, run this from the repository folder:

```bash
npm run start
```

Then open:

```text
http://127.0.0.1:4173/
```

The local server also accepts the GitHub Pages-style base path:

```text
http://127.0.0.1:4173/WaterfallWonder/
```

Because the site is plain HTML/CSS/JavaScript, you can also open `index.html` directly in a browser for a quick check.

## Build And Validate

There is no framework build step. The build command syncs shared site data, regenerates the source ledger, and runs validation:

```bash
npm run build
```

The validation checks required files, local image/script/style links, JSON-LD blocks, sitemap shape, image dimensions, sitemap/page coverage, source-ledger coverage, property-image registry coverage, asset weight warnings, freshness dates, private-path leakage, and domain alignment. A passing build means the static package is ready for human launch review, not automatic publication.

`npm run build` first runs the local sync step, which aligns shared headers, footers, mobile booking CTAs, page titles, descriptions, canonical URLs, Open Graph/Twitter metadata, JSON-LD `dateModified` values, visible review dates, and sitemap `lastmod` values from `scripts/site-data.mjs`. Update that file before changing repeated site-wide metadata, source records, booking links, or public image governance by hand.

Rendered browser QA is available separately:

```bash
npm run qa:browser
```

That command renders every registered public page at mobile, tablet, and desktop widths. It also captures focused homepage views for the reviews, waterfall, night, and gallery sections, because those areas carry the highest visual and conversion risk. It writes reports and screenshots to `QA_OUTPUT_DIR` when set, or to the system temp folder by default.

When Playwright is installed, browser QA also checks interaction behavior and horizontal overflow. On machines without Playwright, the script falls back to Microsoft Edge for screenshot and local-image checks; that fallback records a coverage note in the JSON report and treats lower homepage section screenshots as isolated previews.

## Publish Or Update

Recommended GitHub repository:

```text
https://github.com/madsen-spec/WaterfallWonder
```

Recommended branch:

```text
main
```

For a plain static site, GitHub Pages can publish directly from the `main` branch root after the repository owner enables Pages in GitHub settings. Do not enable GitHub Pages until the repository contents have been reviewed for privacy, rights, and public-marketing issues.

The current public GitHub Pages URL is:

```text
https://madsen-spec.github.io/WaterfallWonder/
```

The canonical URL, Open Graph URLs, `robots.txt`, and `sitemap.xml` are aligned to that GitHub Pages URL. Add a `CNAME` file only after the custom domain is registered and its DNS records point to GitHub Pages.

The included GitHub Actions workflow runs build validation and rendered browser QA on pull requests or manual dispatch. It does not deploy the website.

## Pre-Publication Checklist

Before making the site public:

- Confirm the GitHub repository is private unless public release is intended.
- Confirm whether GitHub Pages will make the website publicly accessible.
- Confirm the public URL and custom-domain DNS.
- Confirm all property photos are approved for website use.
- Confirm attraction/place photos have clear usage rights.
- Confirm booking policies, bed count, pet approval details, Saw Creek registration guidance, and amenity rules are current.
- Re-check public review counts and observation dates.
- Review for marketing/compliance concerns, including guarantees, unsupported "best/top" claims, testimonials, misleading fee claims, and confidential information.
- Review `CONTENT_SOURCES.md`, `SOURCE_LEDGER.md`, and `MAINTENANCE_CHECKLIST.md`.
