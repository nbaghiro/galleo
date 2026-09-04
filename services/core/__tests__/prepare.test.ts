import { describe, expect, it } from "vitest";
import { estimateCost } from "@model/tools";
import { affordable } from "@services/core/prepare";
import { pricesFor } from "@services/core/spend";

// the DB-backed pass is exercised in prepare.itest.ts; this is the gate it opens with
describe("affordable", () => {
    const ws = { id: "ws", plan: "pro", seats: 1 };
    const first = estimateCost("write-speaker-notes", { sections: 1 }, pricesFor(ws, {}));

    it("lets a pass start when the balance covers the first thing it will ask for", () => {
        expect(affordable({ ...ws, aiCreditsBalance: first })).toBe(true);
        expect(affordable({ ...ws, aiCreditsBalance: first + 500 })).toBe(true);
    });

    it("keeps a workspace that cannot pay from opening a hold that would only be refused", () => {
        expect(affordable({ ...ws, aiCreditsBalance: first - 1 })).toBe(false);
        expect(affordable({ ...ws, aiCreditsBalance: 0 })).toBe(false);
    });
});
