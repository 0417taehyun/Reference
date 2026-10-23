import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { referenceSchema } from './lib/reference-schema.mjs';
export const previewReferenceId = process.env.REFERENCE_PREVIEW_ID;
if (previewReferenceId && !/^[a-z0-9-]+$/u.test(previewReferenceId))
    throw new Error('REFERENCE_PREVIEW_ID must be a lowercase reference ID.');
export const collections = {
    references: defineCollection({
        loader: glob({ pattern: previewReferenceId ? `{ko,en}/${previewReferenceId}.md` : '**/*.md', base: './references' }),
        schema: referenceSchema,
    }),
};
