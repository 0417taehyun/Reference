import { describe, it, expect } from 'vitest';
import { remark } from 'remark';
import remarkHtml from 'remark-html';
import { scanHighlights } from './highlight.mjs';
import remarkHighlight from './remark-highlight.mjs';
const body = `I managed him for three years. ==He owns problems end to end==, always.

==He explains trade-offs clearly==. And ==this one has no theme==.`;
describe('scanHighlights', () => {
    it('finds highlights in document order with sequential ids', () => {
        const highlights = scanHighlights(body, '01-park');
        expect(highlights.map((highlight) => highlight.id)).toEqual(['hl-01-park-1', 'hl-01-park-2', 'hl-01-park-3']);
        expect(highlights[0]).toMatchObject({ text: 'He owns problems end to end' });
        expect(highlights[2].text).toBe('this one has no theme');
    });
    it('handles Korean text', () => {
        const highlights = scanHighlights('그는 ==문제를 끝까지 책임지는=={ownership} 사람입니다.', 'ko');
        expect(highlights).toHaveLength(1);
        expect(highlights[0].text).toBe('문제를 끝까지 책임지는');
    });
    it('renders independent underlines without keyword attributes', async () => {
        const source = '==성장 가능성==과 ==유연한 설계==';
        expect(scanHighlights(source, 'alden').map(highlight => highlight.text)).toEqual(['성장 가능성', '유연한 설계']);
        const rendered = String(await remark().use(remarkHighlight).use(remarkHtml, { sanitize: false }).process(source));
        expect(rendered).toContain('성장 가능성</mark>');
        expect(rendered).not.toContain('data-theme');
    });
});
describe('remarkHighlight', () => {
    it('renders marks whose ids match scanHighlights', async () => {
        const file = await remark()
            .use(remarkHighlight)
            .use(remarkHtml, { sanitize: false })
            .process({ value: body, path: '/x/01-park.md' });
        const html = String(file);
        expect(html).toContain('<mark id="hl-01-park-1">He owns problems end to end</mark>');
        expect(html).toContain('<mark id="hl-01-park-2">');
        expect(html).toContain('<mark id="hl-01-park-3">this one has no theme</mark>');
        expect(html).not.toContain('==');
    });
    it('prefers frontmatter refId over the filename', async () => {
        const file = await remark()
            .use(() => (tree, file) => {
            file.data.astro = { frontmatter: { refId: 'custom' } };
        })
            .use(remarkHighlight)
            .use(remarkHtml, { sanitize: false })
            .process({ value: '==a==', path: '/x/other.md' });
        expect(String(file)).toContain('id="hl-custom-1"');
    });
    it('escapes special characters inside highlights', async () => {
        const file = await remark()
            .use(remarkHighlight)
            .use(remarkHtml, { sanitize: false })
            .process('==a & "c"==');
        expect(String(file)).toContain('>a &amp; &quot;c&quot;</mark>');
    });
});
