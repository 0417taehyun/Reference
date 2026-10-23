export function readSession(key: string, fallback = ''): string {
    try {
        return sessionStorage.getItem(key) ?? fallback;
    }
    catch {
        return fallback;
    }
}
export function writeSession(key: string, value: string): void {
    try {
        sessionStorage.setItem(key, value);
    }
    catch { /* Storage may be unavailable; reading remains usable. */ }
}
export function readSessionList(key: string): string[] {
    try {
        return parseStringList(JSON.parse(readSession(key, '[]')));
    }
    catch {
        return [];
    }
}
export function parseStringList(value: unknown): string[] {
    if (!Array.isArray(value))
        return [];
    return value.filter((entry): entry is string => typeof entry === 'string');
}
