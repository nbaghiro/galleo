// Minimal typing for the Vite-injected `import.meta.env` (we only read `.DEV` for dev-only UI gating).
interface ImportMetaEnv {
    readonly DEV: boolean;
    readonly PROD: boolean;
}
interface ImportMeta {
    readonly env: ImportMetaEnv;
}
