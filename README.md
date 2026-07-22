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
- `content/visual-copy.json` for copy revisions made through the local Visual Copy Editor.
- `SOURCE_LEDGER.md` and `SOURCE_LEDGER.csv` for the public-safe claim/source ledger generated from `scripts/site-data.mjs`.
- `robots.txt` and `sitemap.xml` for search engines.
- `404.html` for a static-hosting not-found page.
- `_headers` for Cloudflare Pages security and search-indexing controls.
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

Because the site is plain HTML/CSS/JavaScript, you can also open `index.html` directly in a browser for a quick check.

## Edit Copy Visually

On Windows, double-click `Start Visual Copy Editor.cmd`. It opens a local-only editor in your browser; keep the small command window open while you work. If Node.js is already installed, the same tool can be started from this folder with:

```bash
npm run copy:edit
```

In the editor:

1. Choose any of the 13 public pages or the 404 page.
2. Switch among the real 1440-pixel desktop, 768-pixel tablet, and 390-pixel mobile layouts.
3. Click highlighted headings, paragraphs, calls to action, FAQ questions and answers, or footer text.
4. Type directly in the page, then choose **Save changes**.

One save applies all unsaved fields together, updates the governed copy registry, rebuilds the generated site files, and runs both copy and full-site validation. If any save or check fails, the source and generated files are restored together. Inline links, icons, accessibility text, and element structure cannot be changed through this copy-only tool.

The editor listens only on this computer and does not publish, push, or commit anything. A passing check confirms site integrity; it does not verify a new factual claim, approve marketing copy, or authorize publication. Continue to manage metadata, booking destinations, source records, claim statuses, and verification dates in `scripts/site-data.mjs`.

## Build And Validate

There is no framework build step. The build command syncs shared site data, regenerates the source ledger, and runs validation:

```bash
npm run build
```

The validation checks required files, governed visual-copy structure and drift, local image/script/style links, JSON-LD blocks, sitemap shape, image dimensions, sitemap/page coverage, source-ledger coverage, property-image registry coverage, asset weight warnings, freshness dates, private-path leakage, and domain alignment. It then creates a clean `dist/` package containing only public website files for Cloudflare Pages. Source ledgers, editor files, scripts, and project documentation are deliberately excluded. A passing build means the static package is ready for human launch review, not automatic publication.

`npm run build` first runs the local sync step, which aligns shared headers, footers, mobile booking CTAs, page titles, descriptions, canonical URLs, Open Graph/Twitter metadata, JSON-LD `dateModified` values, visible review dates, and sitemap `lastmod` values from `scripts/site-data.mjs`. A later saved Visual Copy Editor revision automatically becomes the effective page-modified date without changing any evidence-verification date. Update `scripts/site-data.mjs` before changing repeated site-wide metadata, source records, booking links, or public image governance by hand.

Rendered browser QA is available separately:

```bash
npm run qa:browser
```

That command renders every registered public page at mobile, tablet, and desktop widths. It also captures focused homepage views for the reviews, waterfall, and gallery sections, because those areas carry the highest visual and conversion risk. It writes reports and screenshots to `QA_OUTPUT_DIR` when set, or to the system temp folder by default.

When Playwright is installed, browser QA also checks interaction behavior and horizontal overflow. On machines without Playwright, the script falls back to Microsoft Edge for screenshot and local-image checks; that fallback records a coverage note in the JSON report and treats lower homepage section screenshots as isolated previews.

## Publish Or Update

Production domain:

```text
https://waterfall-wonder.com/
```

Recommended hosting setup: connect the GitHub repository to **Cloudflare Pages** so every pull request receives a preview and only the production branch publishes to the custom domain.

Use these Cloudflare Pages build settings:

```text
Project name: waterfall-wonder
Production branch: main
Framework preset: None
Build command: npm run build
Build output directory: dist
Root directory: leave blank
```

After the first successful Pages deployment, add `waterfall-wonder.com` under the project's **Custom domains** setting. Because the domain is registered and managed in Cloudflare, Cloudflare can create the required DNS record after confirmation. Use the apex domain as canonical. Redirect `www.waterfall-wonder.com` to the apex with a Cloudflare Bulk Redirect and a proxied `www` A record to `192.0.2.1`, preserving paths and query strings.

Also redirect the generated `waterfall-wonder.pages.dev` address to the custom domain after launch. The included `_headers` file marks Pages preview/generated addresses `noindex` in the meantime; that is a search-engine instruction, not access control.

The canonical URL, Open Graph URLs, structured data, `robots.txt`, and `sitemap.xml` are governed by `publicDomain` in `scripts/site-data.mjs` and aligned to `https://waterfall-wonder.com/`. The included GitHub Actions workflow builds the Cloudflare package and runs rendered browser QA on pull requests or manual dispatch. It does not deploy the website by itself.

## Pre-Publication Checklist

Before making the site public:

- Confirm the GitHub repository is private unless public release is intended.
- Confirm the Cloudflare Pages production branch and automatic-deployment controls.
- Confirm both the apex-domain DNS and the intended `www` redirect.
- Confirm the generated `pages.dev` address redirects to the canonical domain after launch.
- Disable the former GitHub Pages publication after the Cloudflare domain is verified so two public copies are not indexed.
- Confirm all property photos are approved for website use.
- Confirm attraction/place photos have clear usage rights.
- Confirm booking policies, bed count, pet approval details, Saw Creek registration guidance, and amenity rules are current.
- Re-check public review counts and observation dates.
- Review for marketing/compliance concerns, including guarantees, unsupported "best/top" claims, testimonials, misleading fee claims, and confidential information.
- Review `CONTENT_SOURCES.md`, `SOURCE_LEDGER.md`, and `MAINTENANCE_CHECKLIST.md`.
