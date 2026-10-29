import { execFileSync } from 'node:child_process';
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/u;
/** Reads the commit date of the last change under references/, or '' when git history is unavailable. */
export function gitReferencesDate(cwd = process.cwd()) {
    try {
        return execFileSync('git', ['log', '-1', '--format=%cs', '--', 'references'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    }
    catch {
        return '';
    }
}
export function lastUpdated(readDate = gitReferencesDate, today = new Date()) {
    const date = readDate();
    return DATE_RE.test(date) ? date : today.toISOString().slice(0, 10);
}
