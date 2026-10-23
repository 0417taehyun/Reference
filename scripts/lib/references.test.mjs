import { describe, it, expect, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { applyTranslation, loadReference, missingTranslations, parseReference, translatedReference, validatePair, validateAnnotations } from './references.mjs';
import { requestTranslation, translateMissing } from './translate.mjs';
export const data = { refId: '01-example', order: 1, name: '홍길동', title: 'Manager', company: 'Example', relationship: '매니저', period: '2023 – 2025', photo: '/photos/example.svg', translated: false, keywords: ['ownership'],
    annotations: [{ text: '끝까지 해결', type: 'circle' }, { text: '끝까지 해결', type: 'star' }] };
export const original = { filename: '01-example.md', language: 'ko', data, body: '그는 ==문제를 끝까지 해결==합니다.\n' };
export const translation = { name: 'Example Name', title: 'Manager', relationship: 'Direct manager', body: 'They ==own problems through resolution==.\n', annotations: [{ text: 'through resolution', type: 'circle' }, { text: 'through resolution', type: 'star' }] };
export async function fixture() {
    const root = await mkdtemp(join(tmpdir(), 'reference-translation-'));
    await Promise.all(['ko', 'en'].map(language => mkdir(join(root, language))));
    await writeFile(join(root, 'ko/01-example.md'), `---\n${stringify(data)}---\n\n${original.body}`);
    return root;
}
export function fakeResponse(value) {
    return { ok: true, status: 200, json: async () => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] }) };
}
describe('reference translation integrity', () => {
    it('preserves highlights, shared circle/star targets and immutable metadata', () => {
        const result = translatedReference(original, translation);
        expect(result.data.refId).toBe(data.refId);
        expect(result.data.originalLanguage).toBe('ko');
        expect(result.data.translated).toBe(true);
        expect(result.language).toBe('en');
        expect(result.data.annotations).toEqual(translation.annotations);
        expect(() => validatePair(original, result)).not.toThrow();
        const reverse = translatedReference({ ...result, data: { ...result.data, translated: false, originalLanguage: 'en' } }, { name: data.name, title: data.title, relationship: data.relationship, body: original.body, annotations: data.annotations });
        expect(reverse.language).toBe('ko');
        expect(reverse.data.originalLanguage).toBe('en');
    });
    it('rejects lost underlines, annotations and mismatched circle/star phrases', () => {
        expect(() => translatedReference(original, { ...translation, body: translation.body.replaceAll('==', '') })).toThrow(/Highlight/);
        expect(() => translatedReference(original, { ...translation, annotations: [] })).toThrow(/Annotation/);
        expect(() => translatedReference(original, { ...translation, annotations: [{ text: 'absent', type: 'circle' }, { text: 'absent', type: 'star' }] })).toThrow(/absent/);
        expect(() => translatedReference(original, { ...translation, annotations: [translation.annotations[0], { text: 'They', type: 'star' }] })).toThrow(/diverged/);
    });
    it('copies keyword lists unchanged and rejects lost or reordered keywords', () => {
        const source = { ...original, data: { ...data, keywords: ['성장', '설계'] } };
        const target = translatedReference(source, translation);
        expect(target.data.keywords).toEqual(['성장', '설계']);
        expect(() => validatePair(source, { ...target, data: { ...target.data, keywords: [] } })).toThrow(/keywords/);
        expect(() => validatePair(source, { ...target, data: { ...target.data, keywords: ['설계', '성장'] } })).toThrow(/keywords/);
    });
    it('uses Karrot for the company and translated prose while preserving company identity', () => {
        const source = { ...original, data: { ...data, company: '당근마켓' }, body: `당근마켓에서 ${original.body}` };
        const translated = { ...translation, body: `At Karrot, ${translation.body}` };
        const target = translatedReference(source, translated);
        expect(target.data.company).toBe('Karrot');
        expect(translatedReference({ ...source, data: { ...source.data, company: '전 당근마켓' } }, translated).data.company).toBe('Formerly at Karrot');
        expect(() => validatePair(target, source)).not.toThrow();
        expect(() => translatedReference(source, { ...translated, body: `At 당근마켓, ${translation.body}` })).toThrow(/glossary/);
        expect(() => validatePair(source, { ...target, data: { ...target.data, company: 'Other' } })).toThrow(/Company identity/);
    });
    it('rejects markup/link injection, malformed YAML metadata and filename mismatches', () => {
        expect(() => translatedReference(original, { ...translation, body: translation.body + '<script>bad()</script>\n' })).toThrow();
        expect(() => parseReference(`---\n${stringify({ ...data, refId: '../bad' })}---\nText\n`, '01-example.md')).toThrow();
        expect(() => parseReference(`---\n${stringify(data)}---\nText\n`, '02-other.md')).toThrow(/filename/);
        expect(() => validateAnnotations({ ...original, body: original.body.replace('문제를 끝까지 해결', '**문제를 끝까지 해결**') })).toThrow(/plain text/);
        expect(() => validateAnnotations({ ...original, body: original.body.replace('==합니다', '=={ownership}합니다') })).toThrow(/keywords list/);
    });
    it('writes only a missing counterpart and leaves an existing translation untouched', async () => {
        const root = await fixture();
        try {
            await assertWriteOnce(root);
        }
        finally {
            await rm(root, { recursive: true, force: true });
        }
    });
    it('replaces only when explicitly requested, after validation, and rejects file symlinks', async () => {
        const root = await fixture();
        try {
            await assertReplacement(root);
        }
        finally {
            await rm(root, { recursive: true, force: true });
        }
    });
    it('uses strict OpenAI output, disables storage and validates before writing', async () => {
        const root = await fixture();
        try {
            await assertApiFlow(root);
        }
        finally {
            await rm(root, { recursive: true, force: true });
        }
    });
    it('creates a counterpart even when its language directory does not exist', async () => {
        const root = await fixture();
        try {
            await rm(join(root, 'en'), { recursive: true });
            await assertApiFlow(root);
        }
        finally {
            await rm(root, { recursive: true, force: true });
        }
    });
    it('rejects HTTP failures, refusal and incomplete output without leaking response bodies', async () => {
        await expect(requestTranslation({}, { apiKey: 'test-placeholder', fetch: async () => ({ ok: false, status: 401 }) })).rejects.toThrow('HTTP 401');
        await expect(requestTranslation({}, { apiKey: 'test-placeholder', fetch: async () => ({ ok: true, json: async () => ({ status: 'incomplete' }) }) })).rejects.toThrow(/incomplete/);
        await expect(requestTranslation({}, { apiKey: 'test-placeholder', fetch: async () => ({ ok: true, json: async () => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal' }] }] }) }) })).rejects.toThrow(/refused/);
    });
    it('rejects invalid API output before creating a counterpart', async () => {
        const root = await fixture();
        try {
            await expect(translateMissing({ root, apiKey: 'test-placeholder', fetch: async () => fakeResponse({ ...translation, annotations: [] }) })).rejects.toThrow(/Annotation/);
            await expect(readFile(join(root, 'en/01-example.md'))).rejects.toThrow(/ENOENT/);
        }
        finally {
            await rm(root, { recursive: true, force: true });
        }
    });
    it('rejects symlink language directories for direct reads and writes', async () => {
        const root = await fixture();
        try {
            await assertSymlinksRejected(root);
        }
        finally {
            await rm(root, { recursive: true, force: true });
        }
    });
});
export async function assertReplacement(root) {
    const source = await loadReference(join(root, 'ko/01-example.md'), root);
    const path = await applyTranslation(source, translation);
    await applyTranslation(source, { ...translation, name: 'Reviewed Example' }, { replace: true });
    const content = await readFile(path, 'utf8');
    expect(content).toContain('Reviewed Example');
    await expect(applyTranslation(source, { ...translation, annotations: [] }, { replace: true })).rejects.toThrow(/Annotation/);
    expect(await readFile(path, 'utf8')).toBe(content);
    await rm(path);
    await symlink(source.path, path);
    await expect(applyTranslation(source, translation, { replace: true })).rejects.toThrow(/regular translation/);
}
export async function assertSymlinksRejected(root) {
    const source = await loadReference(join(root, 'ko/01-example.md'), root);
    await rm(join(root, 'en'), { recursive: true });
    await symlink(join(root, 'ko'), join(root, 'en'));
    await expect(loadReference(join(root, 'en/01-example.md'), root)).rejects.toThrow(/symlink/);
    await expect(applyTranslation(source, translation)).rejects.toThrow(/symlink/);
}
export async function assertWriteOnce(root) {
    const source = await loadReference(join(root, 'ko/01-example.md'), root);
    const path = await applyTranslation(source, translation);
    const before = await readFile(path, 'utf8');
    await expect(applyTranslation(source, translation)).rejects.toThrow(/EEXIST/);
    expect(await readFile(path, 'utf8')).toBe(before);
    expect(missingTranslations([source])).toHaveLength(1);
}
export async function assertApiFlow(root) {
    const request = vi.fn(async (_url, options) => {
        const body = JSON.parse(options.body);
        expect(body.store).toBe(false);
        expect(body.text.format.strict).toBe(true);
        expect(options.redirect).toBe('error');
        return fakeResponse(translation);
    });
    expect(await translateMissing({ root, apiKey: 'test-placeholder', fetch: request })).toHaveLength(1);
    expect(await translateMissing({ root, apiKey: 'test-placeholder', fetch: request })).toEqual([]);
    expect(request).toHaveBeenCalledTimes(1);
}
