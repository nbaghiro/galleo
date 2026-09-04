import { describe, expect, it } from "vitest";
import type { UIBlock } from "@app/stores/chat-blocks";
import { discardSuperseded, pendingProposals, textInsertAt } from "@app/stores/chat-blocks";

const text = (t: string): UIBlock => ({ k: "text", text: t });
const tool = (id: string): UIBlock => ({ k: "tool", blockId: id, tool: id, title: id, done: true });
const widget = (id: string): UIBlock => ({
    k: "widget",
    blockId: id,
    block: { type: "suggestions", items: ["a"] },
});
const card = (blockId: string, tool: string, applied?: "applied" | "discarded"): UIBlock => ({
    k: "widget",
    blockId,
    block: {
        type: "proposal",
        id: `p-${blockId}`,
        tool,
        summary: `${tool} ${blockId}`,
        ...(tool === "write-beats"
            ? { call: { input: { beatIds: ["s2"] } } }
            : { patch: { generation: [{ op: "removeBeat", id: "b1" }] } }),
    },
    ...(applied && { applied }),
});

describe("textInsertAt", () => {
    it("appends when nothing trails", () => {
        expect(textInsertAt([text("hi"), tool("t1")])).toBe(2);
    });

    it("puts prose above a card the tool already returned", () => {
        expect(textInsertAt([tool("t1"), widget("t1")])).toBe(1);
    });

    it("clears a whole run of trailing cards", () => {
        expect(textInsertAt([tool("t1"), widget("t1"), widget("t2")])).toBe(1);
    });

    it("stops at the done tool shell, so a later run does not merge into the first", () => {
        expect(textInsertAt([text("first"), tool("t1"), widget("t1")])).toBe(2);
    });

    it("continues the run when the prose is directly above the card", () => {
        expect(textInsertAt([tool("t1"), text("first"), widget("t1")])).toBe(2);
    });

    it("handles an empty message", () => {
        expect(textInsertAt([])).toBe(0);
    });
});

describe("discardSuperseded", () => {
    it("discards earlier unapplied cards of the same tool, up to the applied one", () => {
        const blocks: UIBlock[] = [
            card("a", "write-beats"),
            text("x"),
            card("b", "write-beats", "applied"),
        ];
        discardSuperseded(blocks, "write-beats", "b");
        expect(blocks[0]).toMatchObject({ applied: "discarded" });
        expect(blocks[2]).toMatchObject({ applied: "applied" });
    });

    it("leaves cards of other tools alone", () => {
        const blocks: UIBlock[] = [
            card("a", "revise-outline"),
            card("b", "plan-outline"),
            card("c", "write-beats"),
        ];
        discardSuperseded(blocks, "write-beats", "c");
        expect(blocks[0]).not.toHaveProperty("applied");
        expect(blocks[1]).not.toHaveProperty("applied");
    });

    it("leaves cards after the applied one live", () => {
        const blocks: UIBlock[] = [
            card("a", "revise-outline", "applied"),
            card("b", "revise-outline"),
        ];
        discardSuperseded(blocks, "revise-outline", "a");
        expect(blocks[1]).not.toHaveProperty("applied");
    });

    it("discards every unapplied card when the applied one lives in a later message", () => {
        const blocks: UIBlock[] = [card("a", "plan-outline"), card("b", "plan-outline")];
        discardSuperseded(blocks, "plan-outline", null);
        expect(blocks[0]).toMatchObject({ applied: "discarded" });
        expect(blocks[1]).toMatchObject({ applied: "discarded" });
    });

    it("never rewrites cards that already resolved", () => {
        const blocks: UIBlock[] = [card("a", "write-beats", "applied"), card("b", "write-beats")];
        discardSuperseded(blocks, "write-beats", null);
        expect(blocks[0]).toMatchObject({ applied: "applied" });
        expect(blocks[1]).toMatchObject({ applied: "discarded" });
    });
});

describe("pendingProposals", () => {
    const msg = (id: number, blocks: UIBlock[]) => ({
        id,
        role: "assistant" as const,
        blocks,
        streaming: false,
    });

    it("lists the cards still waiting, with the payload the agent needs to apply each", () => {
        const out = pendingProposals([
            msg(1, [card("a", "revise-outline"), card("b", "write-beats", "applied")]),
            msg(2, [text("x"), card("c", "write-beats")]),
        ]);
        expect(out.map((p) => p.id)).toEqual(["p-a", "p-c"]);
        expect(out[0]).toMatchObject({
            tool: "revise-outline",
            patch: { generation: [{ op: "removeBeat", id: "b1" }] },
        });
        expect(out[1]).toMatchObject({ tool: "write-beats", call: { input: { beatIds: ["s2"] } } });
    });

    it("keeps only the newest few, since the agent's context is not a ledger", () => {
        const many = Array.from({ length: 12 }, (_, i) => card(`c${i}`, "revise-outline"));
        expect(pendingProposals([msg(1, many)], 3).map((p) => p.id)).toEqual([
            "p-c9",
            "p-c10",
            "p-c11",
        ]);
    });
});
