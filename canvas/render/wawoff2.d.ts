// Ambient types for wawoff2 (Google's woff2 codec compiled to WebAssembly), which ships none. Kept as a
// standalone declaration file because an in-module `declare module` would be read as augmentation, which
// TS forbids for an untyped module. Used by the font embedding in pptx.ts (`decompress`: woff2 → TTF).
declare module "wawoff2" {
    export function decompress(input: Uint8Array): Promise<Uint8Array>;
    export function compress(input: Uint8Array): Promise<Uint8Array>;
}
