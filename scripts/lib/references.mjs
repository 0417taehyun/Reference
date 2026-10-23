import assert from 'node:assert/strict';
import { readFile, readdir, mkdir, writeFile, lstat } from 'node:fs/promises';
import { resolve, relative, dirname, basename } from 'node:path';
import { parse, stringify } from 'yaml';
import { remark } from 'remark';
import { lint } from 'markdownlint/promise';
import { referenceSchema } from '../../src/lib/reference-schema.mjs';
import { HIGHLIGHT_RE, scanHighlights } from '../../src/lib/highlight.mjs';
export const LANGUAGES = ['ko', 'en'];
export const TRANSLATED_FIELDS = ['name', 'title', 'relationship'];
export const PRESERVED_FIELDS = ['refId', 'order', 'period', 'photo', 'linkedin', 'keywords'];
export const TRANSLATION_GLOSSARY = [{ ko: '당근마켓', en: 'Karrot' }, { ko: '전 당근마켓', en: 'Formerly at Karrot' }];
export const MARKDOWN_CONFIG = { default: true, MD013: false, MD041: false, MD033: true };
export function referenceLocation(path, root = resolve('references')) {
    const location = relative(root, resolve(path)).replaceAll('\\', '/');
    const match = /^(ko|en)\/([a-z0-9-]+)\.md$/u.exec(location);
    assert(match, 'Reference path must be references/{ko,en}/lowercase-id.md');
    return { root, path: resolve(path), language: match[1], filename: `${match[2]}.md`, referenceId: match[2] };
}
export function parseReference(source, filename) {
    assert(Buffer.byteLength(source, 'utf8') <= 64 * 1024, `${filename}: reference exceeds 64 KiB`);
    const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(source);
    assert(match, `${filename}: YAML frontmatter is required`);
    const data = referenceSchema.parse(parse(match[1], { maxAliasCount: 0 }));
    const body = source.slice(match[0].length).trim() + '\n';
    assert(body.trim(), `${filename}: reference body is empty`);
    assert(data.refId === basename(filename, '.md'), `${filename}: refId must match the filename`);
    return { data, body };
}
export async function loadReference(path, root) {
    const location = referenceLocation(path, root);
    const parent = await lstat(dirname(location.path));
    assert(parent.isDirectory() && !parent.isSymbolicLink(), 'Reference language directory must not be a symlink.');
    const status = await lstat(location.path);
    assert(status.isFile() && !status.isSymbolicLink(), 'References must be regular files.');
    assert(status.size <= 64 * 1024, 'Reference exceeds 64 KiB.');
    return { ...location, ...parseReference(await readFile(location.path, 'utf8'), location.filename) };
}
export async function languageFiles(language, root) {
    const directory = resolve(root, language);
    const status = await lstat(directory).catch(allowMissingLanguageDirectory);
    if (!status)
        return [];
    assert(status.isDirectory() && !status.isSymbolicLink(), `${directory}: language directory must not be a symlink`);
    const entries = await readdir(directory, { withFileTypes: true });
    assert(entries.every(entry => entry.isFile() && /^[a-z0-9-]+\.md$/u.test(entry.name)), `${directory}: use regular lowercase-id.md files only`);
    return entries.map(entry => resolve(directory, entry.name)).sort();
}
export function allowMissingLanguageDirectory(error) {
    if (error.code === 'ENOENT')
        return null;
    throw error;
}
export async function loadReferences(root = resolve('references')) {
    const groups = await Promise.all(LANGUAGES.map(language => languageFiles(language, root)));
    return Promise.all(groups.flat().map(path => loadReference(path, root)));
}
export function markdownTree(body) { return remark().parse(body.replace(HIGHLIGHT_RE, '$1')); }
export function plainText(node) {
    if (typeof node.value === 'string')
        return node.value;
    return (node.children || []).map(plainText).join('');
}
export function inspectMarkdownNode(node) {
    assert(node.type !== 'html', 'Raw HTML is not allowed in references.');
    assert(!node.url || /^(?:https?:|mailto:|#|\/)/iu.test(node.url), 'Unsafe Markdown URL scheme.');
    (node.children || []).forEach(inspectMarkdownNode);
}
export function markdownStructure(node) {
    return { type: node.type, depth: node.depth, url: node.url, ordered: node.ordered, children: node.children?.map(markdownStructure) };
}
export function validateAnnotations(reference) {
    const tree = markdownTree(reference.body);
    inspectMarkdownNode(tree);
    const text = plainText(tree);
    const missing = reference.data.annotations.find(note => !text.includes(note.text));
    assert(!missing, `${reference.filename || 'reference'}: annotation phrase is absent from body: ${missing?.text}`);
    const malformed = reference.body.replace(HIGHLIGHT_RE, '').includes('==');
    assert(!malformed, 'Malformed highlight; use ==plain text==.');
    assert(!Array.from(reference.body.matchAll(HIGHLIGHT_RE)).some(match => match[2]), 'Move inline keyword tags to the frontmatter keywords list.');
    scanHighlights(reference.body, reference.data.refId).forEach(validateHighlight);
}
export function validateHighlight(highlight) {
    const tree = remark().parse(highlight.text);
    const paragraph = tree.children[0];
    assert(tree.children.length === 1 && paragraph?.type === 'paragraph' && paragraph.children.every(node => node.type === 'text'), 'Highlights must contain plain text without nested Markdown.');
}
export async function lintReference(reference) {
    validateAnnotations(reference);
    const result = await lint({ strings: { [reference.filename]: reference.body }, config: MARKDOWN_CONFIG });
    const errors = result[reference.filename] || [];
    assert(!errors.length, errors.map(error => `${reference.language}/${reference.filename}:${error.lineNumber}: ${error.ruleNames.join('/')} ${error.errorDescription}`).join('\n'));
}
export function missingTranslations(references) {
    return references.filter(reference => !references.some(candidate => candidate.filename === reference.filename && candidate.language !== reference.language));
}
export function validateAnnotationGroup(source, target, index) {
    const phrase = source.data.annotations[index].text;
    const translatedPhrase = target.data.annotations[index].text;
    const matching = source.data.annotations.map((note, position) => ({ note, position })).filter(entry => entry.note.text === phrase);
    assert(matching.every(entry => target.data.annotations[entry.position].text === translatedPhrase), 'Circle/star targets for the same source phrase diverged.');
}
export function validatePair(source, target) {
    PRESERVED_FIELDS.forEach(field => assert.deepEqual(target.data[field], source.data[field], `${source.filename}: ${field} differs between languages`));
    validateCompany(source, target);
    validateGlossary(target);
    assert.equal(scanHighlights(target.body, target.data.refId).length, scanHighlights(source.body, source.data.refId).length, 'Highlight count changed.');
    assert.deepEqual(target.data.annotations.map(note => note.type), source.data.annotations.map(note => note.type), 'Annotation types/order changed.');
    assert.deepEqual(markdownStructure(markdownTree(target.body)), markdownStructure(markdownTree(source.body)), 'Markdown structure or link destinations changed.');
    source.data.annotations.forEach((_note, index) => validateAnnotationGroup(source, target, index));
    validateAnnotations(target);
}
export function localizedCompany(company, language) {
    const entry = TRANSLATION_GLOSSARY.find(term => term.ko === company || term.en === company);
    return entry?.[language] || company;
}
export function validateCompany(source, target) {
    assert.equal(localizedCompany(target.data.company, 'en'), localizedCompany(source.data.company, 'en'), 'Company identity changed.');
    const english = source.language === 'en' ? source : target;
    assert.equal(english.data.company, localizedCompany(english.data.company, 'en'), 'Use the approved English company name.');
}
export function validateGlossary(reference) {
    if (reference.language !== 'en')
        return;
    const text = [plainText(markdownTree(reference.body)), ...TRANSLATED_FIELDS.map(field => reference.data[field])].join('\n');
    const untranslated = TRANSLATION_GLOSSARY.find(term => text.includes(term.ko));
    assert(!untranslated, `Use the approved English glossary term: ${untranslated?.en}`);
}
export async function lintReferences(root, paired = false) {
    const references = await loadReferences(root);
    await Promise.all(references.map(lintReference));
    references.forEach(reference => validateExistingPair(reference, references));
    assert(!paired || !missingTranslations(references).length, 'A language counterpart is missing.');
    return references;
}
export function validateExistingPair(reference, references) {
    const counterpart = references.find(candidate => candidate.filename === reference.filename && candidate.language !== reference.language);
    if (counterpart)
        validatePair(reference, counterpart);
}
export function translationPacket(reference) {
    return { sourceLanguage: reference.language, targetLanguage: reference.language === 'ko' ? 'en' : 'ko',
        data: { ...Object.fromEntries(TRANSLATED_FIELDS.map(field => [field, reference.data[field]])), company: reference.data.company }, body: reference.body,
        glossary: TRANSLATION_GLOSSARY,
        keywords: reference.data.keywords,
        annotations: reference.data.annotations };
}
export function translatedReference(source, translation) {
    assert.deepEqual(Object.keys(translation).sort(), ['annotations', 'body', 'name', 'relationship', 'title'].sort(), 'Unexpected translation fields.');
    const language = source.language === 'ko' ? 'en' : 'ko';
    const data = referenceSchema.parse({ ...source.data, name: translation.name, title: translation.title, relationship: translation.relationship, company: localizedCompany(source.data.company, language),
        translated: true, originalLanguage: source.data.originalLanguage || source.language, annotations: translation.annotations });
    assert(typeof translation.body === 'string', 'Translation body must be a string.');
    const target = { ...source, language, data, body: translation.body.trim() + '\n' };
    validatePair(source, target);
    return target;
}
export async function applyTranslation(source, translation, options = {}) {
    const target = translatedReference(source, translation);
    await lintReference(target);
    const path = resolve(source.root, target.language, source.filename);
    await mkdir(dirname(path), { recursive: true });
    const parent = await lstat(dirname(path));
    assert(parent.isDirectory() && !parent.isSymbolicLink(), 'Translation directory must not be a symlink.');
    const serialized = `---\n${stringify(target.data)}---\n\n${target.body}`;
    parseReference(serialized, source.filename);
    if (options.replace)
        await assertReplacementFile(path);
    await writeFile(path, serialized, { flag: options.replace ? 'w' : 'wx' });
    return path;
}
export async function assertReplacementFile(path) {
    const status = await lstat(path);
    assert(status.isFile() && !status.isSymbolicLink(), 'Only an existing regular translation file can be replaced.');
}
