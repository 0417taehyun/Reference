import { describe, it, expect } from 'vitest';
import { checkSource } from './check-code.mjs';

describe('repository code conventions', () => {
    it('allows guard clauses, exported helpers and public methods', () => {
        const source = 'export function update(value) { if (!value) return; return value; } export class Reader { update(value) { if (!value) return; return value; } }';
        expect(checkSource(source, 'example.ts')).toEqual([]);
    });
    it('rejects else, nested control flow, private methods and abbreviated bindings', () => {
        expect(checkSource('export function update(value) { if (value) return 1; else return 0; }', 'example.ts').join()).toMatch(/else/);
        expect(checkSource('export function update(values) { for (const value of values) { if (value) return; } }', 'example.ts').join()).toMatch(/nested control flow/);
        expect(checkSource('export class Reader { private update() {} }', 'example.ts').join()).toMatch(/public/);
        expect(checkSource('export function update(btn) { return btn; }', 'example.ts').join()).toMatch(/descriptive/);
        expect(checkSource('function hidden() {}', 'example.ts').join()).toMatch(/exported/);
    });
    it('checks Astro frontmatter and scripts while resetting depth at callback boundaries', () => {
        expect(checkSource('---\nconst btn = 1;\n---\n<p>text</p>', 'example.astro').join()).toMatch(/descriptive/);
        expect(checkSource('<script>function hidden() {}</script>', 'example.astro').join()).toMatch(/exported/);
        expect(checkSource('export function update(values) { if (values) values.forEach(value => { if (value) return; }); }', 'example.ts')).toEqual([]);
    });
});
