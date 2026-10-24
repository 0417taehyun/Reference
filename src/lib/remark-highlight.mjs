import { basename, extname } from 'node:path';
import { visit } from 'unist-util-visit';
import { HIGHLIGHT_RE, anchorId, escapeHtml } from './highlight.mjs';
import { keywordExcerpts } from './keywords.mjs';
export const TEXT_BLOCKS = new Set(['paragraph', 'heading', 'tableCell']);
export function appendHighlight(result, match, referenceId) {
    if (match.index > result.offset)
        result.parts.push({ type: 'text', value: result.value.slice(result.offset, match.index) });
    result.count++;
    result.parts.push({ type: 'html', value: `<mark id="${escapeHtml(anchorId(referenceId, result.count))}">${escapeHtml(match[1].trim())}</mark>` });
    result.offset = match.index + match[0].length;
    return result;
}
export function highlightParts(value, referenceId, count = 0) {
    const result = Array.from(value.matchAll(HIGHLIGHT_RE)).reduce((state, match) => appendHighlight(state, match, referenceId), { value, parts: [], offset: 0, count });
    if (!result.parts.length)
        return result;
    if (result.offset < value.length)
        result.parts.push({ type: 'text', value: value.slice(result.offset) });
    return result;
}
export function replaceHighlightNode(node, index, parent, state) {
    if (!parent || index == null || !node.value.includes('=='))
        return;
    const result = highlightParts(node.value, state.referenceId, state.count);
    if (!result.parts.length)
        return;
    state.count = result.count;
    parent.children.splice(index, 1, ...result.parts);
    return index + result.parts.length;
}
export function inlineText(node) {
    if (node.type === 'text' || node.type === 'inlineCode')
        return node.value;
    if (node.type === 'break')
        return '\n';
    return (node.children || []).map(inlineText).join('');
}
export function transformHighlights(tree, file) {
    const frontmatter = file.data?.astro?.frontmatter ?? {};
    const path = file.path ?? file.history?.[0] ?? 'reference';
    const state = { referenceId: frontmatter.refId ?? basename(path, extname(path)), count: 0 };
    // Read before the marks replace the text; Astro returns it as remarkPluginFrontmatter.
    const blocks = [];
    visit(tree, node => TEXT_BLOCKS.has(node.type), node => { blocks.push(inlineText(node)); });
    frontmatter.keywordExcerpts = keywordExcerpts(blocks, state.referenceId);
    visit(tree, 'text', (node, index, parent) => replaceHighlightNode(node, index, parent, state));
}
export default function remarkHighlight() { return transformHighlights; }
