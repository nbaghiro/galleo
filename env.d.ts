// Vite's client env, typed exactly rather than through `vite/client`'s `any` index signature.
// VITE_APP_BUILD is injected by vite.config.ts, not read from a .env file.
interface ImportMetaEnv {
    // Vite's own flag, false in anything `vite build` produces. Declared because this file replaces
    // `vite/client` rather than extending it, so nothing else supplies it.
    readonly DEV: boolean;
    readonly VITE_POSTHOG_KEY?: string;
    readonly VITE_POSTHOG_HOST?: string;
    readonly VITE_APP_BUILD?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
