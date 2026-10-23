import { describe, it, expect } from 'vitest';
import { collectKeywords } from './keywords.mjs';

describe('reference keyword summary', () => {
    it('counts each reference once per keyword and sorts by people then first appearance', () => {
        expect(collectKeywords([
            { refId: 'first', keywords: ['ownership', 'ownership', 'mentoring'] },
            { refId: 'second', keywords: ['mentoring'] },
            { refId: 'third', keywords: ['execution'] },
            { refId: 'first', keywords: ['ownership'] },
        ])).toEqual([
            { key: 'mentoring', people: 2 },
            { key: 'ownership', people: 1 },
            { key: 'execution', people: 1 },
        ]);
    });
    it('uses the metadata list independently of body text and underlines', () => {
        expect(collectKeywords([{ refId: 'alden', keywords: ['성장', '설계'], body: 'No underlines here.' }])).toEqual([
            { key: '성장', people: 1 },
            { key: '설계', people: 1 },
        ]);
    });
    it('ignores missing lists and never extracts inline body keywords', () => {
        expect(collectKeywords([{ refId: 'draft', body: '==An underline=={ownership}' }])).toEqual([]);
    });
});
