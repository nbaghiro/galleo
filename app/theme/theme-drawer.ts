import { createSignal } from "solid-js";

// Global open-state for the singular theme drawer — any app-level trigger (sidebar button, editor
// pill) flips it; the drawer itself is mounted once at the app root.
const [themeDrawerOpen, setThemeDrawerOpen] = createSignal(false);

export { themeDrawerOpen };

export function openThemeDrawer(): void {
    setThemeDrawerOpen(true);
}

export function closeThemeDrawer(): void {
    setThemeDrawerOpen(false);
}
