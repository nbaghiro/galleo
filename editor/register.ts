// Registers every element into the registry. The element library lives in canvas, so the aggregate
// side-effect imports live there (@elements/register); this re-exports them for the app startup path
// (app/main.tsx imports it before mount) and is where any editor-only registration would go.

import "@elements/register";
