// Central site config — single source of truth for nav, tools registry, CTAs.

export const SITE = {
  name: 'Expired Domains',
  url: 'https://expired-domains.github.io',
  tagline: 'Find & buy expired domains with traffic, backlinks and authority.',
  description:
    'Browse expired domains by extension, check WHOIS, DNS and domain age with free tools, and learn how to buy expired domains for SEO.',
  catchdoms: 'https://catchdoms.com',
};

// Tools registry — drives the /tools/ hub, cross-links and "related tools".
// `built: false` = planned (phase 2), shown as muted on the hub, no page yet.
export const TOOLS = [
  {
    slug: 'whois-lookup',
    name: 'WHOIS Lookup',
    category: 'Domain',
    short: 'Look up a domain’s owner, registrar, key dates and status.',
    kw: 'whois lookup',
    built: true,
  },
  {
    slug: 'dns-lookup',
    name: 'DNS Lookup',
    category: 'DNS',
    short: 'Query A, AAAA, MX, TXT, NS and CNAME records for any domain.',
    kw: 'dns lookup',
    built: true,
  },
  {
    slug: 'domain-age-checker',
    name: 'Domain Age Checker',
    category: 'Domain',
    short: 'See how old a domain is from its registration date.',
    kw: 'domain age checker',
    built: true,
    funnel: true,
  },
  {
    slug: 'reverse-ip-lookup',
    name: 'Reverse IP Lookup',
    category: 'DNS',
    short: 'Find the hostname behind an IP address (PTR record).',
    kw: 'reverse ip lookup',
    built: true,
  },
  {
    slug: 'domain-availability',
    name: 'Domain Availability Checker',
    category: 'Domain',
    short: 'Check whether a domain is registered or available.',
    kw: 'domain availability checker',
    built: false,
  },
  {
    slug: 'mx-lookup',
    name: 'MX Lookup',
    category: 'DNS',
    short: 'Inspect the mail servers configured for a domain.',
    kw: 'mx lookup',
    built: false,
  },
  {
    slug: 'dns-propagation-checker',
    name: 'DNS Propagation Checker',
    category: 'DNS',
    short: 'Check DNS propagation across multiple resolvers.',
    kw: 'dns propagation checker',
    built: false,
  },
  {
    slug: 'domain-authority-checker',
    name: 'Domain Authority Checker',
    category: 'SEO',
    short: 'Check the authority of a domain before you buy it.',
    kw: 'domain authority checker',
    built: false,
    funnel: true,
  },
];

export const builtTools = () => TOOLS.filter((t) => t.built);

export const toolBySlug = (slug) => TOOLS.find((t) => t.slug === slug);

// 3 related built tools (excludes the current one).
export const relatedTools = (slug, n = 3) =>
  builtTools()
    .filter((t) => t.slug !== slug)
    .slice(0, n);

// ccTLD -> flag emoji. gTLDs (com/net/org/info/biz/pro/app) get no flag.
const CCTLD_FLAGS = {
  fr: '🇫🇷', de: '🇩🇪', nl: '🇳🇱', uk: '🇬🇧', 'co.uk': '🇬🇧', eu: '🇪🇺',
  be: '🇧🇪', es: '🇪🇸', jp: '🇯🇵', it: '🇮🇹', us: '🇺🇸', cz: '🇨🇿',
  in: '🇮🇳', ca: '🇨🇦', ch: '🇨🇭', gr: '🇬🇷', at: '🇦🇹', ro: '🇷🇴',
  br: '🇧🇷', ie: '🇮🇪', pl: '🇵🇱', se: '🇸🇪', za: '🇿🇦', co: '🇨🇴',
  io: '🇮🇴', me: '🇲🇪', ai: '🇦🇮',
};

// Flag emoji for a domain name's ccTLD, derived from the name itself
// (handles multi-part like .co.uk). Returns '' for gTLDs.
export function ccFlag(name) {
  if (!name) return '';
  const parts = String(name).toLowerCase().split('.');
  const two = parts.slice(-2).join('.');
  const one = parts.at(-1);
  return CCTLD_FLAGS[two] || CCTLD_FLAGS[one] || '';
}
