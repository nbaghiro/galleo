import { mkdirSync } from "node:fs";
import { request, test as setup } from "@playwright/test";
import { statePath } from "@e2e/fixtures";

// One API login per persona, saved as storageState so specs pick a role without a UI login.
// Sequential logins stay under the login limiter (10 per 5 minutes per IP).
const PERSONAS = ["demo", "demo+admin", "demo+member", "demo+invited"];
const PASSWORD = "galleo-demo-2026";

setup("persona storage states", async ({ baseURL }) => {
    mkdirSync("e2e/.state", { recursive: true });
    for (const persona of PERSONAS) {
        const ctx = await request.newContext({ baseURL });
        const res = await ctx.post("/api/auth/login", {
            data: { email: `${persona}@galleo.app`, password: PASSWORD },
        });
        if (!res.ok()) throw new Error(`login failed for ${persona}: ${res.status()}`);
        await ctx.storageState({ path: statePath(persona) });
        await ctx.dispose();
    }
});
