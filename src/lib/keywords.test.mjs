import { describe, it, expect } from 'vitest';
import { collectKeywords, excerptKeywords, keywordExcerpts, keywordQuotes, sentenceSegments } from './keywords.mjs';

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
    it('ignores references without tagged highlights', () => {
        expect(collectKeywords([{ refId: 'draft', keywords: excerptKeywords(keywordExcerpts(['==An underline== without a tag.'], 'draft')) }])).toEqual([]);
    });
});

describe('keyword excerpts', () => {
    const blocks = [
        '저는 강진우입니다. 2023년에 함께 일했습니다. ==기대를 넘었습니다.=={성장}',
        '특히 ==유연한 설계==를 통해, ==종속되지 않게 설계=={설계,성장}했고 서비스를 열었습니다. 다음 문장입니다.',
    ];
    it('keeps the whole sentence around each tagged highlight and numbers ids like the marks', () => {
        expect(keywordExcerpts(blocks, 'alden')).toEqual([
            { text: '기대를 넘었습니다.', highlights: [{ id: 'hl-alden-1', start: 0, end: 10, keywords: ['성장'] }] },
            {
                text: '특히 유연한 설계를 통해, 종속되지 않게 설계했고 서비스를 열었습니다.',
                highlights: [
                    { id: 'hl-alden-2', start: 3, end: 9, keywords: [] },
                    { id: 'hl-alden-3', start: 15, end: 25, keywords: ['설계', '성장'] },
                ],
            },
        ]);
    });
    it('stops at the sentence a highlight already ends and spans sentences a highlight crosses', () => {
        expect(keywordExcerpts(['Before. ==He shipped it. Then he stayed.=={growth} After this.'], 'en')[0].text).toBe('He shipped it. Then he stayed.');
        expect(keywordExcerpts(['He said ==“it works.”=={growth} Next.'], 'en')[0].text).toBe('He said “it works.”');
    });
    it('marks only the highlights tagged with the selected keyword', () => {
        const [, sentence] = keywordExcerpts(blocks, 'alden');
        expect(sentenceSegments(sentence, '설계')).toEqual([
            { text: '특히 유연한 설계를 통해, ', marked: false },
            { text: '종속되지 않게 설계', marked: true },
            { text: '했고 서비스를 열었습니다.', marked: false },
        ]);
    });
    it('groups quotes by reference in reading order and links to the first tagged mark', () => {
        const references = [
            { refId: 'alden', excerpts: keywordExcerpts(blocks, 'alden') },
            { refId: 'henry', excerpts: keywordExcerpts(['==협업 역량=={협업}을 갖췄어요.'], 'henry') },
        ];
        const quotes = keywordQuotes(references, '성장');
        expect(quotes.map(quote => quote.reference.refId)).toEqual(['alden']);
        expect(quotes[0].sentences.map(sentence => sentence.href)).toEqual(['#hl-alden-1', '#hl-alden-3']);
        expect(keywordQuotes(references, '없음')).toEqual([]);
    });
});
