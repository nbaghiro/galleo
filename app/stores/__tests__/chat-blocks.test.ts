import { describe, expect, it } from "vitest";
import type { UIBlock } from "@app/stores/chat-blocks";
import { resolveBriefs, textInsertAt } from "@app/stores/chat-blocks";

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
