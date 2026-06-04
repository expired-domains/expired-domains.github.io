// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Money page = home, targeting "expired domains". Every route trailing-slashed,
// directory output so /tools/whois-lookup/ -> /tools/whois-lookup/index.html.
export default defineConfig({
  site: 'https://expired-domains.github.io',
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [sitemap()],
});
