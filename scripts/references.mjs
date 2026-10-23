import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { applyTranslation, lintReferences, loadReference, translationPacket } from './lib/references.mjs';
import { translateMissing } from './lib/translate.mjs';
export async function lintCommand(argumentsList) {
    const references = await lintReferences(undefined, argumentsList.includes('--paired'));
    console.log(`References passed (${references.length} files).`);
}
export async function translateCommand() {
    const paths = await translateMissing();
    paths.forEach(path => console.log(`Created ${path}`));
    console.log(`Translated ${paths.length} missing counterparts.`);
}
export async function packetCommand(argumentsList) {
    const reference = await loadReference(argumentsList[0]);
    console.log(JSON.stringify(translationPacket(reference), null, 2));
}
export async function applyCommand(argumentsList) {
    const reference = await loadReference(argumentsList[0]);
    const translation = JSON.parse(await readFile(argumentsList[1], 'utf8'));
    console.log(`Saved ${await applyTranslation(reference, translation, { replace: argumentsList.includes('--replace') })}`);
}
export async function main(argumentsList = process.argv.slice(2)) {
    const commands = { lint: lintCommand, translate: translateCommand, packet: packetCommand, apply: applyCommand };
    const [command = 'lint', ...parameters] = argumentsList;
    const handler = Object.hasOwn(commands, command) && commands[command];
    if (!handler)
        throw new Error('Use lint [--paired], translate, packet <reference.md>, or apply <reference.md> <translation.json> [--replace].');
    await handler(parameters);
}
export async function run() {
    try {
        await main();
    }
    catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
    await run();
