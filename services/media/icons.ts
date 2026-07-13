import type { IconItem, IconPick } from "@model/media";

const BASE = "https://api.iconify.design";
const UA = { "User-Agent": "Galleo/1.0 (+https://galleo.app)" };

export async function searchIcons(
    q: string,
    limit = 60,
): Promise<{ icons: IconItem[]; total: number }> {
    const u = new URL(`${BASE}/search`);
    u.searchParams.set("query", q);
    u.searchParams.set("limit", String(Math.min(120, Math.max(1, limit))));
    const res = await fetch(u, { headers: UA });
    if (!res.ok) throw new Error(`iconify ${res.status}`);
    const json = (await res.json()) as { icons?: string[]; total?: number };
    return { icons: (json.icons ?? []).map((id) => ({ id })), total: json.total ?? 0 };
}

export async function getIcon(id: string): Promise<IconPick | null> {
    const [prefix, name] = id.split(":");
    if (!prefix || !name) return null;
    const res = await fetch(`${BASE}/${prefix}.json?icons=${encodeURIComponent(name)}`, {
        headers: UA,
    });
    if (!res.ok) throw new Error(`iconify ${res.status}`);
    const json = (await res.json()) as {
        icons?: Record<string, { body: string; width?: number; height?: number }>;
        width?: number;
        height?: number;
    };
    const ic = json.icons?.[name];
    if (!ic) return null;
    return {
        id,
        body: ic.body,
        width: ic.width ?? json.width ?? 24,
        height: ic.height ?? json.height ?? 24,
    };
}
