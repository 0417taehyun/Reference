import { HIGHLIGHT_RE, anchorId, keywordTags } from './highlight.mjs';
// A sentence ends at terminal punctuation (and any closing quote) followed by whitespace.
export const SENTENCE_BREAK_RE = /[.!?…。]+["'”’)\]]*(?:\s+|$)/gu;
export function addKeyword(groups, entry, order) {
    const keyword = groups.get(entry.key) || { key: entry.key, referenceIds: new Set(), order };
    keyword.referenceIds.add(entry.referenceId);
    groups.set(entry.key, keyword);
    return groups;
}
export function collectKeywords(references) {
    const entries = references.flatMap(reference => [...new Set(reference.keywords || [])].map(key => ({ key, referenceId: reference.refId })));
    const groups = entries.reduce((result, entry, index) => addKeyword(result, entry, index), new Map());
    return [...groups.values()]
        .sort((first, second) => second.referenceIds.size - first.referenceIds.size || first.order - second.order)
        .map(({ key, referenceIds }) => ({ key, people: referenceIds.size }));
}
/** Removes highlight markup from one block and records where each highlight sits in the plain text. */
export function plainBlock(source, previousCount = 0) {
    const block = { text: '', offset: 0, highlights: [] };
    for (const match of source.matchAll(HIGHLIGHT_RE)) {
        block.text += source.slice(block.offset, match.index);
        const start = block.text.length;
        block.text += match[1].trim();
        block.highlights.push({ number: previousCount + block.highlights.length + 1, start, end: block.text.length, keywords: keywordTags(match[2]) });
        block.offset = match.index + match[0].length;
    }
    block.text += source.slice(block.offset);
    return block;
}
export function sentenceStart(text, position) {
    const last = Array.from(text.slice(0, position).matchAll(SENTENCE_BREAK_RE)).at(-1);
    return last ? last.index + last[0].length : 0;
}
export function sentenceEnd(text, position) {
    // A highlight that already ends with punctuation (or a closing quote) keeps only its own sentence.
    const match = Array.from(text.matchAll(SENTENCE_BREAK_RE)).find(candidate => candidate.index + candidate[0].trimEnd().length >= position);
    return match ? match.index + match[0].trimEnd().length : text.length;
}
export function groupSentences(sentences, highlight, text) {
    const start = sentenceStart(text, highlight.start), end = Math.max(highlight.end, sentenceEnd(text, highlight.end));
    const previous = sentences.at(-1);
    if (previous && start < previous.end) {
        previous.end = Math.max(previous.end, end);
        previous.highlights.push(highlight);
        return sentences;
    }
    sentences.push({ start, end, highlights: [highlight] });
    return sentences;
}
export function excerptFor(text, sentence, referenceId) {
    return {
        text: text.slice(sentence.start, sentence.end),
        highlights: sentence.highlights.map(highlight => ({
            id: anchorId(referenceId, highlight.number), start: highlight.start - sentence.start, end: highlight.end - sentence.start, keywords: highlight.keywords,
        })),
    };
}
/**
 * Turns the text of each Markdown block, in document order, into the sentences that
 * hold a keyword-tagged highlight. Highlight ids follow the same numbering as the marks.
 */
export function keywordExcerpts(blocks, referenceId) {
    const result = blocks.reduce((state, source) => {
        const block = plainBlock(source, state.count);
        state.count += block.highlights.length;
        const sentences = block.highlights.reduce((grouped, highlight) => groupSentences(grouped, highlight, block.text), []);
        state.excerpts.push(...sentences.map(sentence => excerptFor(block.text, sentence, referenceId)));
        return state;
    }, { count: 0, excerpts: [] });
    return result.excerpts.filter(excerpt => excerpt.highlights.some(highlight => highlight.keywords.length));
}
export function excerptKeywords(excerpts) {
    return excerpts.flatMap(excerpt => excerpt.highlights.flatMap(highlight => highlight.keywords));
}
/** Splits a sentence into plain and marked runs, marking only highlights tagged with `key`. */
export function sentenceSegments(excerpt, key) {
    const marked = excerpt.highlights.filter(highlight => highlight.keywords.includes(key));
    const result = marked.reduce((state, highlight) => {
        state.segments.push({ text: excerpt.text.slice(state.offset, highlight.start), marked: false }, { text: excerpt.text.slice(highlight.start, highlight.end), marked: true });
        state.offset = highlight.end;
        return state;
    }, { segments: [], offset: 0 });
    result.segments.push({ text: excerpt.text.slice(result.offset), marked: false });
    return result.segments.filter(segment => segment.text);
}
export function quoteSentences(excerpts, key) {
    return excerpts.filter(excerpt => excerpt.highlights.some(highlight => highlight.keywords.includes(key))).map(excerpt => ({
        href: `#${excerpt.highlights.find(highlight => highlight.keywords.includes(key)).id}`,
        segments: sentenceSegments(excerpt, key),
    }));
}
/** Every reference that tagged `key`, in reading order, with the sentences that mention it. */
export function keywordQuotes(references, key) {
    return references
        .map(reference => ({ reference, sentences: quoteSentences(reference.excerpts, key) }))
        .filter(quote => quote.sentences.length);
}
