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
- `robots.txt` and `sitemap.xml` for search engines.
- `404.html` for a static-hosting not-found page.
- `CNAME` and `.nojekyll` for GitHub Pages custom-domain publishing.
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

## Build And Validate

There is no framework build step. The build command runs a validation check for the static site:

```bash
npm run build
```

The validation checks required files, local image/script/style links, JSON-LD blocks, sitemap shape, image dimensions, sitemap/page coverage, asset weight warnings, freshness dates, and domain alignment. A passing build means the static package is ready to upload or publish after human launch review.

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

The intended production domain is:

```text
https://waterfallwonderpoconos.com/
```

The `CNAME`, canonical URL, Open Graph URLs, `robots.txt`, and `sitemap.xml` are aligned to that custom domain. Do not enable GitHub Pages on a temporary project URL for indexing unless the canonical strategy is reviewed first.

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
- Review `CONTENT_SOURCES.md` and `MAINTENANCE_CHECKLIST.md`.
