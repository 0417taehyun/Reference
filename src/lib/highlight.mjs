export const HIGHLIGHT_RE = /==([^=\n]+?)==(?:\{([\p{L}\p{N}-]+)\})?/gu;
export function anchorId(referenceId, sequenceNumber) { return `hl-${referenceId}-${sequenceNumber}`; }
export function scanHighlights(body, referenceId) {
    return Array.from(body.matchAll(HIGHLIGHT_RE), (match, index) => ({
        sequenceNumber: index + 1, id: anchorId(referenceId, index + 1), text: match[1].trim(),
    }));
}
export function escapeHtml(value) {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
