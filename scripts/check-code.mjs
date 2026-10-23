import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import typescript from 'typescript';
export async function sourceFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const groups = await Promise.all(entries.map(entry => sourceEntry(directory, entry)));
    return groups.flat();
}
export async function sourceEntry(directory, entry) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory())
        return sourceFiles(path);
    return /\.(?:ts|mjs|astro)$/.test(path) ? [path] : [];
}
export function scriptSections(source, filename) {
    if (!filename.endsWith('.astro'))
        return [source];
    const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---/u)?.[1] || '';
    return [frontmatter, ...Array.from(source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gu), match => match[1])];
}
export function isControl(node) {
    return typescript.isIfStatement(node) || typescript.isForStatement(node) || typescript.isForOfStatement(node) || typescript.isForInStatement(node) || typescript.isWhileStatement(node) || typescript.isDoStatement(node) || typescript.isSwitchStatement(node) || typescript.isTryStatement(node);
}
export function isFunction(node) {
    return typescript.isFunctionDeclaration(node) || typescript.isMethodDeclaration(node) || typescript.isConstructorDeclaration(node) || typescript.isArrowFunction(node) || typescript.isFunctionExpression(node);
}
export function checkBindingName(node, source, problems) {
  const declaresBinding = typescript.isVariableDeclaration(node) || typescript.isParameter(node) || typescript.isBindingElement(node) || typescript.isPropertyDeclaration(node);
  if (!declaresBinding || !typescript.isIdentifier(node.name) || !/^(?:[A-Za-z]{1,2}|args|btn|refs|fm|hs|th|cdp|mq|rc|rb|fp|num)$/u.test(node.name.text)) return;
  const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  problems.push(`${source.fileName}:${line}: use a descriptive binding name instead of ${node.name.text}`);
}

export function inspectNode(node, source, depth, problems) {
    checkBindingName(node, source, problems);
    const nestedDepth = isFunction(node) ? 0 : depth;
    const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
    if (typescript.isIfStatement(node) && node.elseStatement)
        problems.push(`${source.fileName}:${line}: else/else-if is forbidden`);
    if (isControl(node) && nestedDepth > 0)
        problems.push(`${source.fileName}:${line}: nested control flow exceeds function + one block`);
    if (typescript.isPrivateIdentifier(node) || node.modifiers?.some(modifier => modifier.kind === typescript.SyntaxKind.PrivateKeyword || modifier.kind === typescript.SyntaxKind.ProtectedKeyword))
        problems.push(`${source.fileName}:${line}: methods must be public and testable`);
    if (typescript.isFunctionDeclaration(node) && !node.modifiers?.some(modifier => modifier.kind === typescript.SyntaxKind.ExportKeyword))
        problems.push(`${source.fileName}:${line}: named functions must be exported`);
    typescript.forEachChild(node, child => inspectNode(child, source, nestedDepth + Number(isControl(node)), problems));
}
export function checkSection(section, filename, problems) {
    const source = typescript.createSourceFile(filename, section, typescript.ScriptTarget.Latest, true, typescript.ScriptKind.TS);
    source.parseDiagnostics.forEach(diagnostic => problems.push(`${filename}: ${typescript.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`));
    inspectNode(source, source, 0, problems);
}
export function checkSource(text, filename) {
    const problems = [];
    const sections = scriptSections(text, filename);
    sections.forEach(section => checkSection(section, filename, problems));
    return problems;
}
export async function main() {
    const files = [...await sourceFiles('src'), ...await sourceFiles('scripts'), 'astro.config.mjs'];
    const groups = await Promise.all(files.map(async (filename) => checkSource(await readFile(filename, 'utf8'), filename)));
    const problems = groups.flat();
    problems.forEach(problem => console.error(problem));
    if (problems.length) {
        process.exitCode = 1;
        return;
    }
    console.log(`Code rules passed (${files.length} files).`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
    await main();
