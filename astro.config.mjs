import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://costperacceptedchange.org',
  trailingSlash: 'never',
  build: {
    format: 'file',
  },
});
