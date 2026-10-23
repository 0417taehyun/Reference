// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import { unified } from '@astrojs/markdown-remark';
import site from './src/content/site.json' with { type: 'json' };
import remarkHighlight from './src/lib/remark-highlight.mjs';
// https://astro.build/config
export default defineConfig({
    // Used for canonical URLs, hreflang links and OG tags.
    // Set `url` in src/content/site.json to your custom domain.
    site: site.url,
    trailingSlash: 'always',
    markdown: {
        // Astro 7 defaults to the Sätteri processor, which has no remark plugin
        // hook; the unified pipeline is needed for the ==highlight== syntax.
        processor: unified({
            remarkPlugins: [remarkHighlight],
        }),
    },
    vite: {
        plugins: [tailwindcss()],
    },
});
