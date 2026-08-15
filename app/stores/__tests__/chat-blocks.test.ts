import { describe, expect, it } from "vitest";
import type { UIBlock } from "@app/stores/chat-blocks";
import { discardSuperseded, resolveBriefs, textInsertAt } from "@app/stores/chat-blocks";

const text = (t: string): UIBlock => ({ k: "text", text: t });
const tool = (id: string): UIBlock => ({ k: "tool", blockId: id, tool: id, title: id, done: true });
const widget = (id: string): UIBlock => ({
    k: "widget",
    blockId: id,
    block: { type: "suggestions", items: ["a"] },
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

describe("resolveBriefs", () => {
    const brief = (blockId: string, state: "pending" | "started" | "superseded"): UIBlock => ({
        k: "brief",
        blockId,
        brief: { prompt: "p", surface: "deck" },
        state,
    });

    it("starts the chosen brief and supersedes the other pending ones", () => {
        const blocks: UIBlock[] = [brief("a", "pending"), text("x"), brief("b", "pending")];
        resolveBriefs(blocks, "b");
        expect(blocks[0]).toMatchObject({ state: "superseded" });
        expect(blocks[2]).toMatchObject({ state: "started" });
    });

    it("supersedes every pending brief in messages that hold no started one", () => {
        const blocks: UIBlock[] = [brief("a", "pending")];
        resolveBriefs(blocks, null);
        expect(blocks[0]).toMatchObject({ state: "superseded" });
    });

    it("never rewrites briefs that already resolved", () => {
        const blocks: UIBlock[] = [brief("a", "started"), brief("b", "superseded")];
        resolveBriefs(blocks, "b");
        expect(blocks[0]).toMatchObject({ state: "started" });
        expect(blocks[1]).toMatchObject({ state: "superseded" });
    });
});

describe("discardSuperseded", () => {
    type CardType = "outline" | "write" | "plan";
    const card = (blockId: string, type: CardType, applied?: "applied" | "discarded"): UIBlock => ({
        k: "widget",
        blockId,
        block:
            type === "outline"
                ? { type, summary: "s", ops: [{ op: "removeBeat", id: "b1" }] }
                : type === "write"
                  ? { type, summary: "s", beatIds: ["s2"] }
                  : { type, summary: "s" },
        ...(applied && { applied }),
    });

    it("discards earlier unapplied cards of the same type, up to the applied one", () => {
        const blocks: UIBlock[] = [card("a", "write"), text("x"), card("b", "write", "applied")];
        discardSuperseded(blocks, "write", "b");
        expect(blocks[0]).toMatchObject({ applied: "discarded" });
        expect(blocks[2]).toMatchObject({ applied: "applied" });
    });

    it("leaves cards of the other types alone", () => {
        const blocks: UIBlock[] = [card("a", "outline"), card("b", "plan"), card("c", "write")];
        discardSuperseded(blocks, "write", "c");
        expect(blocks[0]).not.toHaveProperty("applied");
        expect(blocks[1]).not.toHaveProperty("applied");
    });

    it("leaves cards after the applied one live", () => {
        const blocks: UIBlock[] = [card("a", "outline", "applied"), card("b", "outline")];
        discardSuperseded(blocks, "outline", "a");
        expect(blocks[1]).not.toHaveProperty("applied");
    });

    it("discards every unapplied card when the applied one lives in a later message", () => {
        const blocks: UIBlock[] = [card("a", "plan"), card("b", "plan")];
        discardSuperseded(blocks, "plan", null);
        expect(blocks[0]).toMatchObject({ applied: "discarded" });
        expect(blocks[1]).toMatchObject({ applied: "discarded" });
    });

    it("never rewrites cards that already resolved", () => {
        const blocks: UIBlock[] = [card("a", "write", "applied"), card("b", "write")];
        discardSuperseded(blocks, "write", null);
        expect(blocks[0]).toMatchObject({ applied: "applied" });
        expect(blocks[1]).toMatchObject({ applied: "discarded" });
    });
});
