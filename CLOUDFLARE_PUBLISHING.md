# Cloudflare Publishing Runbook

The production site is `https://waterfall-wonder.com/`. Cloudflare Pages is the selected host, and the apex domain is the canonical address.

## One-Time Cloudflare Setup

1. Commit the reviewed website changes and merge them to the GitHub `main` branch.
2. In Cloudflare, open **Workers & Pages**, create a Pages application, and connect the `madsen-spec/WaterfallWonder` GitHub repository.
3. Limit the Cloudflare GitHub application's repository access to this repository where practical.
4. Use these build settings:

   - Project name: `waterfall-wonder`
   - Production branch: `main`
   - Framework preset: None
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory: blank

5. Review the first `waterfall-wonder.pages.dev` deployment before attaching the production domain.
6. In the Pages project, open **Custom domains** and add `waterfall-wonder.com`. Complete the Cloudflare-created DNS change.
7. Create a Cloudflare Bulk Redirect from `www.waterfall-wonder.com` to `https://waterfall-wonder.com/` with a 301 response, preserving the path and query string. Add a proxied `www` A record pointing to `192.0.2.1` so Cloudflare can receive and redirect those requests.
8. Create a Cloudflare Bulk Redirect from `waterfall-wonder.pages.dev` to `https://waterfall-wonder.com/`, preserving the path and query string.
9. Confirm HTTPS, the custom 404 page, security headers, `robots.txt`, `sitemap.xml`, social preview metadata, and several representative pages on the production domain.
10. Disable the former GitHub Pages publication after the Cloudflare domain is verified, preventing duplicate public copies. If preserving old inbound URLs is important, replace it with a dedicated redirect-only publication rather than the full site.
11. Require the existing **Site QA** check before merging to `main`, so a direct unvalidated change cannot immediately become the production site.
12. Submit `https://waterfall-wonder.com/sitemap.xml` to Google Search Console after launch.

## Normal Release Flow

1. Make and save copy changes locally.
2. Run `npm run build` and `npm run qa:browser`.
3. Review the generated `dist/` package and the pre-publication checklist.
4. Commit and push a branch, then review Cloudflare's branch preview.
5. Merge the approved branch to `main`. Cloudflare Pages will deploy that commit to the production domain.
6. Verify the production deployment and keep Cloudflare's prior deployment available for rollback.

## Release Stop Conditions

Do not merge to `main` when validation or browser QA fails, factual review is stale, image rights are unresolved, private material appears in `dist/`, the Pages preview differs materially from the reviewed local site, or the custom-domain/redirect configuration is not confirmed.
