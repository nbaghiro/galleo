import { createSignal } from "solid-js";
import { resolveTheme } from "@themes/library";
import { api, type ApiFolder } from "../data/api";
import { appTheme } from "../theme/theme";

// Shared folder state — the sidebar lists/creates them, the library filters by them.
const [folders, setFolders] = createSignal<ApiFolder[]>([]);
let loaded = false;

export { folders };

export async function loadFolders(): Promise<void> {
    if (loaded) return;
    loaded = true;
    try {
        const r = await api.listFolders();
        setFolders(r.folders);
    } catch {
        loaded = false;
    }
}

export async function addFolder(name: string, parentId?: string | null): Promise<ApiFolder | null> {
    try {
        const { folder } = await api.createFolder(name, parentId);
        setFolders([...folders(), folder]);
        return folder;
    } catch {
        return null;
    }
}

function hexToHsl(hex: string): [number, number, number] {
    const m = hex.replace("#", "");
    if (m.length < 6) return [25, 55, 50];
    const r = parseInt(m.slice(0, 2), 16) / 255;
    const g = parseInt(m.slice(2, 4), 16) / 255;
    const b = parseInt(m.slice(4, 6), 16) / 255;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const d = mx - mn;
    const l = (mx + mn) / 2;
    let h = 0;
    if (d) {
        if (mx === r) h = ((g - b) / d) % 6;
        else if (mx === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h = (h * 60 + 360) % 360;
    }
    const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
    return [h, s * 100, l * 100];
}

// A stable, distinct color per folder — DERIVED from the active app theme's accent (hue-rotated, with
// readability-clamped saturation/lightness), so folders stay unique AND recolor when the theme changes.
export function folderColor(id: string): string {
    const theme = resolveTheme(appTheme());
    const [h, s, l] = hexToHsl(theme.tokens.accent);
    let hash = 0;
    for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
    const hue = Math.round((h + (hash % 9) * 40) % 360);
    const sat = Math.round(Math.max(45, Math.min(78, s)));
    const lig = Math.round(
        theme.dark ? Math.max(54, Math.min(70, l + 8)) : Math.max(42, Math.min(56, l)),
    );
    return `hsl(${hue} ${sat}% ${lig}%)`;
}

export function renameFolderById(id: string, name: string): void {
    setFolders(folders().map((f) => (f.id === id ? { ...f, name } : f)));
    api.renameFolder(id, name).catch(() => {});
}

export function removeFolder(id: string): void {
    setFolders(folders().filter((f) => f.id !== id));
    api.deleteFolder(id).catch(() => {});
}
