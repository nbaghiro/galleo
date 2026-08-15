import { describe, expect, it } from "vitest";
import { TOOLS } from "@model/tools";
import type { ToolId } from "@model/tools";
import "@services/core/ai/tools/register";
import { getTool } from "@services/core/ai/tools";

// implement() throws at import for a body whose definition is missing or contradicts it, so simply
// loading the registry is the check: without this, a broken tool only surfaces when the server boots

const implemented = (Object.keys(TOOLS) as ToolId[]).filter((id) => getTool(id));

describe("the tool registry", () => {
    it("loads every tool module without throwing", () => {
        expect(implemented.length).toBeGreaterThan(20);
    });

    it("gives every implemented tool a describe and an input schema", () => {
        for (const id of implemented) {
            const t = getTool(id)!;
            expect(t.describe, id).toBeTruthy();
            expect(t.input, id).toBeTruthy();
        }
    });

    it("implements nothing the model does not define", () => {
        for (const id of implemented) expect(TOOLS[id], id).toBeTruthy();
    });
});
