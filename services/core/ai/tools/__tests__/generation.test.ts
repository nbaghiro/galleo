import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { generateText } from "ai";
import type { Brief, TurnEvent } from "@model/ai";
import { runTool } from "@services/core/ai/execute";
import { memoryGenerationStore } from "@services/core/generations";
import "@services/core/ai/tools/register";

// The one seam is the model call; what runs under it is the real write path, the real store and
// the real executor, so this proves what a generation does rather than restating its tools.
vi.mock("ai", async (importOriginal) => {
    const actual = await importOriginal<typeof import("ai")>();
    return { ...actual, generateText: vi.fn() };
});

beforeAll(() => vi.stubEnv("GALLEO_FAKE_AI", "1"));
afterAll(() => vi.unstubAllEnvs());

const written = (id: string): string =>
    JSON.stringify({
        id,
        root: {
            type: "container",
            data: {
                children: [
                    { type: "text", data: { text: `${id} headline`, style: "h1" } },
                    {
                        type: "text",
                        data: {
                            text: "Three neighbourhood sites, one lease signed, and a kitchen fit-out that starts in March.",
                            style: "body",
                        },
                    },
                ],
            },
        },
    });
const reply = (t: string): Awaited<ReturnType<typeof generateText>> =>
    ({ text: t }) as Awaited<ReturnType<typeof generateText>>;

const brief: Brief = { prompt: "a deck about a bakery", surface: "deck", theme: "studio", set: {} };
// never the network: a phrase resolves to a fixed url
const IMAGES = { source: "ai" as const, generate: async () => "https://img.test/x.jpg" };
const beats = [
    { id: "s1", label: "Open", role: "scene", takeaway: "A bakery worth the walk" },
    { id: "s2", label: "Proof", role: "proof", takeaway: "Sold out by noon", image: true },
    { id: "s3", label: "Close", role: "close", takeaway: "Open a second site" },
];

async function planned() {
    const store = memoryGenerationStore();
    const { generation } = await store.create({ brief });
    await store.apply(generation.id, {
        generation: [{ op: "setOutline", title: "The bakery", beats }],
    });
    return { store, id: generation.id };
}

const run = (
    id: string,
    input: Record<string, unknown>,
    store: ReturnType<typeof memoryGenerationStore>,
    events: TurnEvent[] = [],
) =>
    runTool({ id: id as never, surface: "direct", input }, null, {
        ctx: { image: IMAGES, generations: store },
        onEvent: (e) => events.push(e),
    });

describe("start-generation", () => {
    it("opens a generation whose brief marks every supplied field as the user's", async () => {
        const store = memoryGenerationStore();
        const out = await run(
            "start-generation",
            { prompt: "a deck", surface: "web", goal: "sell", mustInclude: [] },
            store,
        );
        expect(out.ok).toBe(true);
        const gen = out.ok ? (out.result as { id: string; brief: Brief }) : null;
        expect(gen?.brief.set).toEqual({
            prompt: "user",
            surface: "user",
            theme: "user",
            goal: "user",
        });
        expect((await store.read(gen!.id))?.generation.stage).toBe("briefed");
    });
});

describe("revise-outline", () => {
    it("mints beat ids in the outline's scheme, moves, updates, and refuses to remove a written beat", async () => {
        const { store, id } = await planned();
        await store.apply(id, {
            generation: [{ op: "pushVersion", id: "s1", section: JSON.parse(written("s1")) }],
        });
        const out = await run(
            "revise-outline",
            {
                generationId: id,
                summary: "Reshape",
                ops: [
                    { op: "add", afterId: "s2", label: "Pricing", layout: "two-col" },
                    { op: "move", id: "s3", afterId: null },
                    { op: "update", id: "s2", takeaway: "Sold out by eleven" },
                    { op: "remove", id: "s1" },
                    { op: "remove", id: "nope" },
                ],
            },
            store,
        );
        expect(out.ok).toBe(true);
        const gen = (await store.read(id))!.generation;
        expect(gen.outline?.beats.map((b) => b.id)).toEqual(["s3", "s1", "s2", "s4"]);
        expect(gen.outline?.beats[3]).toMatchObject({
            label: "Pricing",
            layout: "two-col",
            blocks: ["text", "text"],
        });
        expect(gen.outline?.beats[2]?.takeaway).toBe("Sold out by eleven");
        expect(gen.beats.s1?.status).toBe("done");
    });

    it("throws, naming the real ids, when nothing in the ops matched the plan", async () => {
        const { store, id } = await planned();
        await expect(
            run(
                "revise-outline",
                { generationId: id, summary: "x", ops: [{ op: "remove", id: "zzz" }] },
                store,
            ),
        ).rejects.toThrow(/s1, s2, s3/);
    });
});

describe("revise-brief, steer, pick-version, finish", () => {
    it("revise-brief sets the fields as the user and closes an open question", async () => {
        const { store, id } = await planned();
        await store.apply(id, { generation: [{ op: "setClarify", question: "Include prices?" }] });
        await run(
            "revise-brief",
            { generationId: id, audience: "locals", clarifications: ["Include prices? · yes"] },
            store,
        );
        const gen = (await store.read(id))!.generation;
        expect(gen.brief.audience).toBe("locals");
        expect(gen.brief.set.audience).toBe("user");
        expect(gen.briefVersion).toBe(1);
        expect(gen.clarify).toBeNull();
    });

    it("steer-generation sets and clears the note, and refuses to clear nothing", async () => {
        const { store, id } = await planned();
        await run("steer-generation", { generationId: id, note: "shorter" }, store);
        expect((await store.read(id))!.generation.steer).toBe("shorter");
        await run("steer-generation", { generationId: id, note: "" }, store);
        expect((await store.read(id))!.generation.steer).toBe("");
        await expect(
            run("steer-generation", { generationId: id, note: "" }, store),
        ).rejects.toThrow(/no steering note/);
    });

    it("pick-version swaps the section of record and remembers the pick", async () => {
        const { store, id } = await planned();
        const a = JSON.parse(written("s1"));
        const b = {
            ...a,
            root: {
                ...a.root,
                data: { children: [{ type: "text", data: { text: "take two", style: "h1" } }] },
            },
        };
        await store.apply(id, {
            artifact: [{ op: "addSection", section: a }],
            generation: [{ op: "pushVersion", id: "s1", section: a }],
        });
        await store.apply(id, {
            artifact: [{ op: "replaceSection", id: "s1", section: b }],
            generation: [{ op: "pushVersion", id: "s1", section: b }],
        });
        await run("pick-version", { generationId: id, beatId: "s1", index: 0 }, store);
        const got = (await store.read(id))!;
        expect(got.generation.beats.s1?.active).toBe(0);
        expect(got.content.sections[0]).toEqual(a);
    });

    it("finish-generation skips what is unwritten and closes the run", async () => {
        const { store, id } = await planned();
        const out = await run("finish-generation", { generationId: id }, store);
        expect(out.ok && out.result).toEqual({ skipped: ["s1", "s2", "s3"] });
        const gen = (await store.read(id))!.generation;
        expect(gen.stage).toBe("done");
        expect(gen.beats.s2?.status).toBe("skipped");
    });
});

describe("apply-patch", () => {
    it("lands a literal patch, or the pending card it names", async () => {
        const { store, id } = await planned();
        await run(
            "apply-patch",
            { generationId: id, patch: { generation: [{ op: "setSteer", note: "warm" }] } },
            store,
        );
        expect((await store.read(id))!.generation.steer).toBe("warm");
        const out = await runTool(
            { id: "apply-patch", surface: "direct", input: { generationId: id, proposal: "p1" } },
            null,
            {
                ctx: {
                    image: {},
                    generations: store,
                    pending: [
                        {
                            id: "p1",
                            tool: "revise-outline",
                            summary: "Drop the close",
                            patch: { generation: [{ op: "removeBeat", id: "s3" }] },
                        },
                    ],
                },
            },
        );
        expect(out.ok).toBe(true);
        expect((await store.read(id))!.generation.outline?.beats.map((b) => b.id)).toEqual([
            "s1",
            "s2",
        ]);
        await expect(
            run("apply-patch", { generationId: id, proposal: "missing" }, store),
        ).rejects.toThrow(/no pending proposal/);
    });
});

describe("write-beat and write-beats", () => {
    // a block, not an expression: a returned function is registered as teardown
    beforeEach(() => {
        vi.mocked(generateText).mockReset();
    });

    it("writes one beat into the draft and records the take", async () => {
        vi.mocked(generateText).mockResolvedValue(reply(written("s2")));
        const { store, id } = await planned();
        const events: TurnEvent[] = [];
        const out = await run("write-beat", { generationId: id, beatId: "s2" }, store, events);
        expect(out.ok).toBe(true);
        const got = (await store.read(id))!;
        expect(got.content.sections.map((s) => s.id)).toEqual(["s2"]);
        expect(got.generation.beats.s2).toMatchObject({ status: "done", active: 0 });
        expect(got.generation.beats.s2?.versions).toHaveLength(1);
        // the words-first preview precedes the landing patch
        const kinds = events.map((e) => e.type);
        expect(kinds.indexOf("section.partial")).toBeLessThan(kinds.indexOf("patch"));
        expect(kinds).toContain("section.timing");
    });

    it("refuses to write a written beat without replace, and reworks it with", async () => {
        vi.mocked(generateText).mockResolvedValue(reply(written("s1")));
        const { store, id } = await planned();
        await run("write-beat", { generationId: id, beatId: "s1" }, store);
        await expect(run("write-beat", { generationId: id, beatId: "s1" }, store)).rejects.toThrow(
            /already written/,
        );
        await run(
            "write-beat",
            { generationId: id, beatId: "s1", replace: true, note: "warmer" },
            store,
        );
        const got = (await store.read(id))!;
        expect(got.generation.beats.s1?.versions).toHaveLength(2);
        expect(got.generation.beats.s1?.active).toBe(1);
        expect(got.content.sections).toHaveLength(1);
    });

    it("writes every unwritten beat in order, anchors each after the last landed, and finishes", async () => {
        vi.mocked(generateText).mockImplementation(async (opts) => {
            const m = /Write section "([^"]+)"/.exec(String(opts.prompt));
            return reply(written(m?.[1] ?? "s1"));
        });
        const { store, id } = await planned();
        const out = await run("write-beats", { generationId: id }, store);
        expect(out.ok && out.result).toEqual({ written: ["s1", "s2", "s3"], failed: [] });
        const got = (await store.read(id))!;
        expect(got.content.sections.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
        expect(got.generation.stage).toBe("done");
    });

    it("marks a beat that never comes back failed and carries on, leaving the run open", async () => {
        vi.mocked(generateText).mockImplementation(async (opts) => {
            const m = /Write section "([^"]+)"/.exec(String(opts.prompt));
            if (m?.[1] === "s2") throw new Error("overloaded_error");
            return reply(written(m?.[1] ?? "s1"));
        });
        const { store, id } = await planned();
        const out = await run("write-beats", { generationId: id }, store);
        expect(out.ok && out.result).toEqual({ written: ["s1", "s3"], failed: ["s2"] });
        const got = (await store.read(id))!;
        expect(got.generation.beats.s2?.status).toBe("failed");
        expect(got.content.sections.map((s) => s.id)).toEqual(["s1", "s3"]);
        expect(got.generation.stage).toBe("writing");
    });

    it("stops between beats when the stream closes, letting the one in flight land", async () => {
        const ctrl = new AbortController();
        vi.mocked(generateText).mockImplementation(async (opts) => {
            const m = /Write section "([^"]+)"/.exec(String(opts.prompt));
            if (m?.[1] === "s1") ctrl.abort(); // the pause arrives mid-first-beat
            return reply(written(m?.[1] ?? "s1"));
        });
        const { store, id } = await planned();
        const out = await runTool(
            { id: "write-beats", surface: "direct", input: { generationId: id } },
            null,
            { ctx: { image: IMAGES, generations: store, signal: ctrl.signal } },
        );
        expect(out.ok && out.result).toEqual({ written: ["s1"], failed: [] });
        const got = (await store.read(id))!;
        expect(got.content.sections.map((s) => s.id)).toEqual(["s1"]);
        expect(got.generation.stage).toBe("writing");
    });
});

describe("finish-generation", () => {
    it("is refused while a writer holds the run, so the beat in flight lands first", async () => {
        const { store, id } = await planned();
        await store.claim(id); // a write-beats stream was aborted mid-beat; the writer still holds it
        const busy = await run("finish-generation", { generationId: id }, store);
        expect(busy).toMatchObject({ ok: false, reason: "busy" });
        await store.apply(id, {
            generation: [
                {
                    op: "pushVersion",
                    id: "s1",
                    section: { id: "s1", root: { type: "container", data: { children: [] } } },
                },
            ],
        });
        await store.release(id);
        const out = await run("finish-generation", { generationId: id }, store);
        expect(out.ok).toBe(true);
        if (!out.ok) return;
        expect((out.result as { skipped: string[] }).skipped).toEqual(["s2", "s3"]);
        const after = (await store.read(id))!.generation;
        expect(after.stage).toBe("done");
        expect(after.beats.s1?.status).toBe("done");
        expect(after.beats.s2?.status).toBe("skipped");
    });
});

describe("a stale outline", () => {
    it("refuses a write once the brief moved past the plan, and writes it with force", async () => {
        const { store, id } = await planned();
        await store.apply(id, {
            generation: [{ op: "setBrief", patch: { goal: "sell more" }, by: "user" }],
        });
        // the body throws, so the call fails with the replan named rather than returning a refusal
        await expect(run("write-beat", { generationId: id, beatId: "s1" }, store)).rejects.toThrow(
            "plan-outline again",
        );
        await expect(run("write-beats", { generationId: id }, store)).rejects.toThrow(
            "plan-outline again",
        );
        const forced = await run(
            "write-beat",
            { generationId: id, beatId: "s1", force: true },
            store,
        );
        expect(forced.ok).toBe(true);
    });
});

describe("what the board sees while writing", () => {
    it("turns a card to writing before the model call, and the next card before the previous lands", async () => {
        const { store, id } = await planned();
        const events: TurnEvent[] = [];
        const out = await run("write-beats", { generationId: id }, store, events);
        expect(out.ok).toBe(true);
        const at = (pred: (e: TurnEvent) => boolean): number => events.findIndex(pred);
        const writing = (beat: string): number =>
            at((e) => e.type === "section.status" && e.id === beat && e.status === "writing");
        const preview = (beat: string): number =>
            at((e) => e.type === "section.partial" && e.id === beat);
        const landed = (beat: string): number =>
            at(
                (e) =>
                    e.type === "patch" &&
                    !!e.patch.artifact?.some(
                        (op) => op.op === "addSection" && op.section.id === beat,
                    ),
            );
        // a card dims to "writing" ahead of its words, and the words-first preview ahead of the landing
        expect(writing("s1")).toBeGreaterThan(-1);
        expect(writing("s1")).toBeLessThan(preview("s1"));
        expect(preview("s1")).toBeLessThan(landed("s1"));
        // the pipeline: the second card is already writing while the first is still landing
        expect(writing("s2")).toBeLessThan(landed("s1"));
    });
});
