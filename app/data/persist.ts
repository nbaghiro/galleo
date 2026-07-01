// Safe localStorage access — never throws. Private-mode / disabled storage just degrades to in-memory
// (a null read, a no-op write).

export function readLS(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

export function writeLS(key: string, value: string): void {
    try {
        localStorage.setItem(key, value);
    } catch {
        // storage unavailable — the value just lives in memory for this session
    }
}
