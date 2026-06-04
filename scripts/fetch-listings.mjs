// Build-time data fetch: pulls expired-domain listings from the CatchDoms API
// and writes src/data/listings.json. Runs in CI (GitHub Actions) before `astro build`.
//
// SECURITY: the API key is read from the CATCHDOMS_API_KEY env var (a GitHub
// Actions secret). It NEVER ships to the browser — this runs at build time only.
//
// SAFE DEGRADE: with no key (e.g. a local dev build), it logs and keeps the
// existing sample listings.json so the site still builds.
//
// NOTE: confirm the endpoint + field mapping once the API key is created. The
// shape below follows the documented /api/domains contract; adjust MAP if needed.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'src', 'data', 'listings.json');

const API_BASE = process.env.CATCHDOMS_API_BASE || 'https://catchdoms.com/api/domains';
const API_KEY = process.env.CATCHDOMS_API_KEY;
const PER_TLD = Number(process.env.LISTING_PER_TLD || 50);
const THROTTLE_MS = Number(process.env.LISTING_THROTTLE_MS || 4500); // ~13 req/min < 15/min cap
const MIN_ROWS = Number(process.env.LISTING_MIN_ROWS || 12); // skip thin TLDs (no page generated)

// TLD (as stored in CatchDoms) -> display label. Ordered by inventory.
// Spammy/low-value TLDs (gdn, cc, xyz, link, vc, ua) intentionally excluded.
// Add or remove extensions here; a /tlds/{tld}/ page generates automatically.
const TLDS = {
  com: '.com', org: '.org', de: '.de', net: '.net', nl: '.nl',
  co: '.co', uk: '.uk', info: '.info', fr: '.fr', eu: '.eu',
  be: '.be', es: '.es', jp: '.jp', it: '.it', us: '.us',
  me: '.me', cz: '.cz', io: '.io', biz: '.biz', in: '.in',
  ca: '.ca', ch: '.ch', ai: '.ai', pro: '.pro', gr: '.gr',
  at: '.at', ro: '.ro', app: '.app', 'co.uk': '.co.uk',
  br: '.br', ie: '.ie', pl: '.pl', se: '.se', za: '.za',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Map one API row to our compact listing shape.
const MAP = (d) => ({
  name: d.name ?? d.domain,
  da: d.domain_authority ?? null,
  score: d.score ?? null,
  age: d.age ?? null,
  backlinks: d.backlinks_count ?? d.backlinks ?? null,
  price: d.effective_price ?? d.price ?? d.max_bid ?? null,
  rd: d.referring_domains ?? null,
  tf: d.trust_flow ?? null,
  cf: d.citation_flow ?? null,
});

async function fetchTld(tld) {
  // /api/domains uses `per_page` (max 100); default order is interesting()
  // (bids > wayback > priority TLDs > score), so no sort param needed.
  const url = `${API_BASE}?tld=${encodeURIComponent(tld)}&per_page=${PER_TLD}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${API_KEY}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`API ${res.status} for .${tld}`);
  const json = await res.json();
  const rows = json.data ?? json.domains ?? [];
  const total = Number(json.meta?.total ?? json.total ?? rows.length) || 0;
  const domains = rows.map(MAP).filter((d) => d.name);
  // Derive simple summary stats for the page intro / SEO text.
  const das = domains.map((d) => d.da).filter((n) => typeof n === 'number');
  const prices = domains.map((d) => d.price).filter((n) => typeof n === 'number');
  return {
    tld,
    label: TLDS[tld],
    total,
    avgDa: das.length ? Math.round(das.reduce((a, b) => a + b, 0) / das.length) : 0,
    priceFrom: prices.length ? Math.min(...prices) : 0,
    domains,
  };
}

async function main() {
  if (!API_KEY) {
    console.warn('[fetch-listings] CATCHDOMS_API_KEY not set — keeping existing sample data.');
    return;
  }

  // Start from current file so a partial failure never wipes good data.
  let current = { tlds: {} };
  try {
    current = JSON.parse(await readFile(OUT, 'utf8'));
  } catch {}

  const out = { generatedAt: new Date().toISOString().slice(0, 10), tlds: { ...current.tlds } };

  let i = 0;
  for (const tld of Object.keys(TLDS)) {
    try {
      const result = await fetchTld(tld);
      if (result.domains.length < MIN_ROWS) {
        delete out.tlds[tld]; // also drops any stale copy from a previous build
        console.log(`[fetch-listings] .${tld}: only ${result.domains.length} rows (< ${MIN_ROWS}) — skipped.`);
      } else {
        out.tlds[tld] = result;
        console.log(`[fetch-listings] .${tld}: ${result.domains.length} rows (total ${result.total}).`);
      }
    } catch (err) {
      console.error(`[fetch-listings] .${tld} failed: ${err.message} — keeping previous data.`);
    }
    if (++i < Object.keys(TLDS).length) await sleep(THROTTLE_MS); // respect 15 req/min
  }

  await writeFile(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(`[fetch-listings] wrote ${OUT}`);
}

main().catch((err) => {
  console.error('[fetch-listings] fatal:', err);
  process.exit(1);
});
