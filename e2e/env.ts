// The e2e environment in one place: the built app on its own port and database, beside the dev
// stack. Imported by playwright.config.ts and the setup files.
export const E2E_PORT = 8611;
export const E2E_BASE = `http://localhost:${E2E_PORT}`;
export const E2E_DB = "postgres://galleo:galleo@localhost:8602/galleo_e2e";
