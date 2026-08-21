// Vite's client env, typed exactly rather than through `vite/client`'s `any` index signature.
// VITE_APP_BUILD is injected by vite.config.ts, not read from a .env file.
interface ImportMetaEnv {
    readonly VITE_POSTHOG_KEY?: string;
    readonly VITE_POSTHOG_HOST?: string;
    readonly VITE_APP_BUILD?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
