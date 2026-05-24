import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://costperacceptedchange.org',
  trailingSlash: 'never',
  build: {
    format: 'file',
  },
  integrations: [sitemap()],
});
