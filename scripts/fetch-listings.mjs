// Build-time data fetch: pulls expired-domain listings from the CatchDoms API
// and writes src/data/listings.json. Runs in CI (GitHub Actions) before `astro build`.
//
// SECURITY: the API key is read from the CATCHDOMS_API_KEY env var (a GitHub
// Actions secret). It NEVER ships to the browser — this runs at build time only.
//
// NO SAFE DEGRADE ANY MORE, AND THAT IS THE POINT. With no key this script now
// FAILS instead of keeping whatever listings.json holds. That silent fallback,
// combined with a committed sample, is how two pages published fabricated
// domain names for five months: nothing failed, nothing warned loudly, and the
// site kept deploying. For a local build without a key, run `astro build` on the
// committed file rather than this script.
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
// 5000 ms = 12 req/min, against a 15/min cap on the CatchDoms API. The previous
// 4500 ms left one request of margin over 34 TLDs, which is not margin.
const THROTTLE_MS = Number(process.env.LISTING_THROTTLE_MS || 5000);

// How long a TLD result may be carried over, measured from ITS OWN `fetchedAt`
// and not from the file's date. Beyond this the entry is dropped and its page
// disappears, which is the point: a stale page claiming to be refreshed daily is
// worse than no page at all.
const MAX_CARRY_DAYS = Number(process.env.LISTING_MAX_CARRY_DAYS || 3);

// Per-request budget, and what it does and does NOT do.
//
// Node's fetch has no default timeout, so a hung request would stall the whole
// build. This bounds the client's wait. It does NOT work around a server-side
// ceiling: production cuts at about 20 s, so a 30 s client budget cannot rescue
// a request the server already gave up on, it only stops us waiting for ever.
//
// Candidate explanation, not an established cause: measured 2026-11-10 on the
// public mirror, .com answers in ~9.3 s against ~1.2 s for .org, which makes an
// upstream timeout a plausible reason why .com and .uk were the two TLDs whose
// fetch threw. The log of the next real run will say.
const REQUEST_TIMEOUT_MS = Number(process.env.LISTING_TIMEOUT_MS || 30000);
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
  // Auction shape. The API has always returned these; this file simply threw
  // them away, so no page could tell an auction from a fixed-price listing.
  // `type` and `source` are what make an auction page possible at all, and
  // `ends` is kept as the raw ISO instant so the page decides how to show it.
  type: d.type ?? null,
  source: d.source ?? null,
  bid: typeof d.max_bid === 'number' ? d.max_bid : null,
  bids: typeof d.bids_count === 'number' ? d.bids_count : null,
  currency: d.currency ?? null,
  ends: d.auction_end_date ?? null,
});

async function fetchTld(tld) {
  // /api/domains uses `per_page` (max 100); default order is interesting()
  // (bids > wayback > priority TLDs > score), so no sort param needed.
  const url = `${API_BASE}?tld=${encodeURIComponent(tld)}&per_page=${PER_TLD}`;

  // ONE RETRY, AND AN EXPLICIT TIMEOUT. The big TLDs are the slow ones, and a
  // single 5xx used to lose a whole TLD for the day (and, with the old seeded
  // fallback, replace it with fabricated rows). Node's fetch has no default
  // timeout, so a hung request would otherwise stall the whole build.
  let res;
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${API_KEY}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (res.ok) break;
      lastError = new Error(`API ${res.status} for .${tld}`);
    } catch (err) {
      lastError = err;
    }
    if (attempt === 1) {
      console.warn(`[fetch-listings] .${tld}: ${lastError.message} — retrying once.`);
      await sleep(THROTTLE_MS);
    }
  }
  if (!res || !res.ok) throw lastError ?? new Error(`API failed for .${tld}`);
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
  // A MISSING KEY IS A HARD FAILURE, not a silent fallback.
  //
  // This used to `return`, which left the build to use whatever was committed in
  // listings.json. Combined with a seeded file, that is exactly how invented
  // domain names stayed live for five months: nothing failed, nothing warned
  // loudly, and the site kept publishing. A build with no data must not deploy.
  if (!API_KEY) {
    console.error('[fetch-listings] CATCHDOMS_API_KEY is not set. Refusing to build with no data.');
    process.exit(1);
  }

  // Start from current file so a partial failure never wipes good data.
  let current = { tlds: {} };
  try {
    current = JSON.parse(await readFile(OUT, 'utf8'));
  } catch {}

  const today = new Date().toISOString().slice(0, 10);

  // CARRY-OVER IS DATED PER TLD, and the distinction matters.
  //
  // My first attempt dated the whole FILE and compared `generatedAt` to today.
  // That bounds nothing: `generatedAt` is rewritten to today as soon as a single
  // TLD succeeds, so a TLD failing for a month kept being carried for ever
  // behind the others' freshness. Caught by Codex before this shipped, and it is
  // exactly the defect this file already suffered from in a cruder form.
  //
  // So each entry carries its own `fetchedAt`, set on success, and is only
  // carried over while ITS OWN age is within the budget. An entry with no
  // `fetchedAt` is NOT carried: that is the safe migration, since every entry
  // written before this change is of unknown age.
  const ageOf = (entry) => {
    const d = entry && typeof entry.fetchedAt === 'string' ? entry.fetchedAt : null;

    return d ? Math.round((Date.parse(today) - Date.parse(d)) / 86400000) : Infinity;
  };

  const out = { generatedAt: today, tlds: {} };
  const dropped = [];

  for (const [tld, entry] of Object.entries(current.tlds ?? {})) {
    const age = ageOf(entry);
    if (age <= MAX_CARRY_DAYS) {
      out.tlds[tld] = entry;
    } else {
      dropped.push(`${tld} (${age === Infinity ? 'undated' : age + 'd'})`);
    }
  }

  if (dropped.length) {
    console.warn(`[fetch-listings] not carrying over: ${dropped.join(', ')}`);
  }

  let fetched = 0;
  const failed = [];

  let i = 0;
  for (const tld of Object.keys(TLDS)) {
    try {
      const result = await fetchTld(tld);
      if (result.domains.length < MIN_ROWS) {
        delete out.tlds[tld]; // also drops any stale copy from a previous build
        console.log(`[fetch-listings] .${tld}: only ${result.domains.length} rows (< ${MIN_ROWS}) — skipped.`);
      } else {
        out.tlds[tld] = { ...result, fetchedAt: today };
        fetched++;
        console.log(`[fetch-listings] .${tld}: ${result.domains.length} rows (total ${result.total}).`);
      }
    } catch (err) {
      failed.push(tld);
      console.error(`[fetch-listings] .${tld} failed: ${err.message}`);
    }
    if (++i < Object.keys(TLDS).length) await sleep(THROTTLE_MS);
  }

  if (failed.length) {
    console.error(`[fetch-listings] ${failed.length} TLD(s) failed: ${failed.join(', ')}`);
  }

  // NOTHING FETCHED MEANS NOTHING DEPLOYS. Failing here keeps the previous
  // deployment live, which is the safe side: the site stays slightly stale
  // instead of going empty or, worse, falling back to fabricated rows.
  if (fetched === 0) {
    console.error('[fetch-listings] no TLD returned usable data. Refusing to write or deploy.');
    process.exit(1);
  }

  await writeFile(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(`[fetch-listings] wrote ${OUT}: ${fetched} TLD(s) fresh, ${failed.length} failed.`);
}

main().catch((err) => {
  console.error('[fetch-listings] fatal:', err);
  process.exit(1);
});
