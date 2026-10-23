import { describe, it, expect } from 'vitest';
import { isPhotoSource, referenceSchema } from './reference-schema.mjs';

describe('reference photo sources', () => {
    it('accepts local images outside photos and HTTPS CDN URLs with query strings', () => {
        expect(isPhotoSource('/photos/alden.jpg')).toBe(true);
        expect(isPhotoSource('/images/alden.webp')).toBe(true);
        expect(isPhotoSource('https://media.example.com/profile/image?size=800&token=example')).toBe(true);
    });
    it('rejects unsafe schemes, credentials and local parent traversal', () => {
        const invalid = ['', 'http://example.com/image.jpg', 'javascript:alert(1)', 'data:image/svg+xml,test', '//example.com/image.jpg', '/images/../image.jpg', 'https://user:password@example.com/image.jpg'];
        expect(invalid.map(isPhotoSource)).toEqual(invalid.map(() => false));
    });
});
describe('reference keywords', () => {
    it('accepts an optional list of nonempty keyword strings', () => {
        const metadata = { refId: 'example', order: 1, name: 'Example', title: 'Lead', company: 'Example', relationship: 'Peer', period: '2023', photo: '/images/example.jpg' };
        expect(referenceSchema.parse(metadata).keywords).toEqual([]);
        expect(referenceSchema.parse({ ...metadata, keywords: [' 성장 ', '설계'] }).keywords).toEqual(['성장', '설계']);
        expect(referenceSchema.safeParse({ ...metadata, keywords: [' '] }).success).toBe(false);
        expect(referenceSchema.safeParse({ ...metadata, keywords: [{ text: '설계' }] }).success).toBe(false);
    });
});
