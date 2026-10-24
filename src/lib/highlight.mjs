export const HIGHLIGHT_RE = /==([^=\n]+?)==(?:\{([^{}\n]*)\})?/gu;
export const KEYWORD_RE = /^[\p{L}\p{N}-]+$/u;
export function anchorId(referenceId, sequenceNumber) { return `hl-${referenceId}-${sequenceNumber}`; }
/** `{성장}` or `{성장, 설계}` after a highlight; duplicates collapse to one keyword. */
export function keywordTags(tag) {
    if (tag === undefined)
        return [];
    return [...new Set(tag.split(',').map(key => key.trim()))];
}
export function scanHighlights(body, referenceId) {
    return Array.from(body.matchAll(HIGHLIGHT_RE), (match, index) => ({
        sequenceNumber: index + 1, id: anchorId(referenceId, index + 1), text: match[1].trim(), keywords: keywordTags(match[2]),
    }));
}
export function escapeHtml(value) {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
