# expired-domains.github.io

Static site (Astro) on GitHub Pages: free domain & DNS tools, expired-domain
listings by extension, and guides. Listing data comes from the CatchDoms API.

## Stack

- **Astro 5** — static output, zero JS shipped by default (only the tool widgets ship a tiny vanilla script).
- `@astrojs/sitemap` — `sitemap-index.xml` generated at build.
- No CSS framework — one `src/styles/global.css`, system fonts.

## Develop

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # outputs to dist/
npm run preview  # preview the build
```

## Structure

```
src/
  config.js              # site config + tools registry (single source of truth)
  data/listings.json     # listing data (SAMPLE; replaced at build by the API fetch)
  layouts/BaseLayout.astro
  components/            # Header, Footer, Breadcrumb, CtaCatchDoms, ListingTable
  pages/
    index.astro          # home page
    tools/               # hub + whois-lookup, dns-lookup, domain-age-checker, reverse-ip-lookup
    tlds/                # hub + [tld].astro (one page per TLD from listings.json)
    guides/              # hub + 3 guides
    about.astro  404.astro
scripts/fetch-listings.mjs   # build-time CatchDoms API fetch
.github/workflows/deploy.yml # build + deploy to Pages (push + daily cron)
```

## Daily fresh listings (the data pipeline)

The site is static, so listings are fetched **at build time**, never in the browser.

1. `scripts/fetch-listings.mjs` calls the CatchDoms API (one request per TLD, throttled
   to stay under the 15 req/min limit) and rewrites `src/data/listings.json`.
2. `astro build` bakes that data into static HTML (crawlable + key never exposed).
3. `.github/workflows/deploy.yml` runs this on every push **and on a daily cron
   (`30 6 * * *`)**, then deploys to Pages. → listings refresh every day automatically.

### Setup (once)

1. Create a CatchDoms API key.
2. Repo → Settings → Secrets and variables → Actions → add secret
   **`CATCHDOMS_API_KEY`**.
3. Repo → Settings → Pages → Source: **GitHub Actions**.
4. Confirm the endpoint + field mapping in `scripts/fetch-listings.mjs`
   (`API_BASE` and the `MAP` function) match the live API response, then push.

Without the secret (e.g. local builds), the fetch step logs a warning and keeps the
existing `listings.json`, so the site always builds.

### Add a TLD

Add it to the `TLDS` map in `scripts/fetch-listings.mjs`. A `/tlds/{tld}/` page is
generated automatically from the data.

### Add a tool

Add an entry to `TOOLS` in `src/config.js` (`built: false` until the page exists),
then create `src/pages/tools/{slug}.astro`.
