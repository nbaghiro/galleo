// Built export artifacts, cached per destination until the artifact changes. Keyed by a caller
// fingerprint (artifact id + edit seq + brand), so tab switches and the Export click reuse one build.
// Values are promises — concurrent readers share a single in-flight build; failures aren't cached.

interface Entry {
    fp: string;
    value: Promise<unknown>;
    dispose?: (value: unknown) => void;
}

const store = new Map<string, Entry>();

export function cachedExport<T>(
    key: string,
    fp: string,
    build: () => Promise<T>,
    dispose?: (value: T) => void,
): Promise<T> {
    const hit = store.get(key);
    if (hit && hit.fp === fp) return hit.value as Promise<T>;
    evict(key);
    const value = build();
    const entry: Entry = { fp, value, dispose: dispose as Entry["dispose"] };
    store.set(key, entry);
    value.catch(() => {
        if (store.get(key) === entry) store.delete(key);
    });
    return value;
}

function evict(key: string): void {
    const hit = store.get(key);
    if (!hit) return;
    store.delete(key);
    // dispose (e.g. revoke blob URLs) once the stale build settles
    if (hit.dispose) void hit.value.then(hit.dispose).catch(() => {});
}

export function clearExportCache(): void {
    for (const key of [...store.keys()]) evict(key);
}
