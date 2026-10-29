import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { DATE_RE, gitReferencesDate, lastUpdated } from './last-updated.mjs';

describe('last updated date', () => {
    const buildDay = new Date('2026-11-02T15:00:00Z');
    it('uses the date of the last commit under references/', () => {
        expect(lastUpdated(() => '2026-10-29', buildDay)).toBe('2026-10-29');
    });
    it('falls back to the build date without git history', () => {
        expect(lastUpdated(() => '', buildDay)).toBe('2026-11-02');
        expect(lastUpdated(() => 'fatal: not a git repository', buildDay)).toBe('2026-11-02');
    });
    it('reads a calendar date from this repository', () => {
        expect(gitReferencesDate()).toMatch(DATE_RE);
    });
    it('returns an empty string outside a git repository', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'last-updated-'));
        expect(gitReferencesDate(directory)).toBe('');
        await rm(directory, { recursive: true });
    });
});
