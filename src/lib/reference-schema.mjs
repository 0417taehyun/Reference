import { z as schemaBuilder } from 'zod';
export const annotationSchema = schemaBuilder.object({ text: schemaBuilder.string().min(1), type: schemaBuilder.enum(['circle', 'star']) });
export function isLinkedInUrl(value) {
    const url = new URL(value);
    return url.protocol === 'https:' && (url.hostname === 'linkedin.com' || url.hostname.endsWith('.linkedin.com'));
}
export function isPhotoSource(value) {
    if (value.startsWith('/'))
        return /^\/(?!\/)[a-zA-Z0-9_./-]+\.(?:svg|png|jpe?g|webp|avif)$/u.test(value) && !value.split('/').includes('..');
    if (!URL.canParse(value))
        return false;
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
}
export const referenceSchema = schemaBuilder.object({
    refId: schemaBuilder.string().regex(/^[a-z0-9-]+$/u), order: schemaBuilder.number().int().nonnegative(),
    name: schemaBuilder.string().min(1), title: schemaBuilder.string().min(1), company: schemaBuilder.string().min(1),
    relationship: schemaBuilder.string().min(1), period: schemaBuilder.string().min(1),
    photo: schemaBuilder.string().refine(isPhotoSource, 'Use a root-relative image path or an HTTPS image URL without embedded credentials.'),
    linkedin: schemaBuilder.string().url().refine(isLinkedInUrl, 'Use an HTTPS LinkedIn profile URL.').optional(),
    translated: schemaBuilder.boolean().default(false), originalLanguage: schemaBuilder.enum(['ko', 'en']).optional(),
    keywords: schemaBuilder.array(schemaBuilder.string().trim().min(1)).default([]),
    annotations: schemaBuilder.array(annotationSchema).default([]),
}).strict();
