import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { streamObject } from "ai";
import { sectionForms } from "@model/artifact";
import type { GenerateInput } from "@model/ai";
import { drain, makeContext } from "@services/core/ai/tools";
import { outlineProblem, planOutlineTool } from "@services/core/ai/tools/plan";
import { templateBody } from "@services/core/templates";

// The one seam is the model call, so what runs under it is the real planner: this proves the design
// a beat names is enforced rather than merely asked for, which is the whole point of the snap.
vi.mock("ai", async (importOriginal) => {
    const actual = await importOriginal<typeof import("ai")>();
    return { ...actual, generateObject: vi.fn(), streamObject: vi.fn() };
});

beforeAll(() => vi.stubEnv("GALLEO_FAKE_AI", "1"));
afterAll(() => vi.unstubAllEnvs());

const STARTER = "startup-pitch";

// deliberately the wrong shape everywhere, so anything that matches a design came from the snap.
// `designs` names one per beat, the way a planner shown the catalog answers.
const planned = (
    n: number,
    designs: (string | undefined)[] = [],
): { partialObjectStream: AsyncIterable<unknown>; object: Promise<unknown> } => ({
    partialObjectStream: (async function* (): AsyncGenerator<unknown> {})(),
    object: Promise.resolve({
        title: "A scripted plan",
        backdrop: "a quiet harbour at dusk",
        beats: Array.from({ length: n }, (_, i) => ({
            id: `s${i + 1}`,
            label: `Beat ${i + 1}`,
            role: "proof",
            layout: "two-col",
            blocks: ["bullets", "bullets"],
            image: false,
            brief: "the scripted job",
            takeaway: "the scripted point",
            points: ["one", "two"],
            ...(designs[i] ? { design: designs[i] } : {}),
        })),
    }),
});

// A provider that dies mid-stream. The two halves of a streamObject reject independently, so the
// `object` here reports whether anyone ever attached a handler: an unclaimed rejection is what ends
// the process, and node's own reporting is too far away in time for a test to wait on.
function dying(): {
    stream: { partialObjectStream: AsyncIterable<unknown>; object: Promise<unknown> };
    claimed: () => boolean;
} {
    let claimed = false;
    const inner = Promise.reject(new Error("the provider hung up"));
    void inner.catch(() => {}); // the harness's own copy, so only the tool's claim is measured
    const object: Promise<unknown> = {
        then: (ok, err) => {
            claimed = true;
            return inner.then(ok, err);
        },
        catch: (err) => {
            claimed = true;
            return inner.catch(err);
        },
        finally: (f) => inner.finally(f),
        [Symbol.toStringTag]: "Promise",
    };
    return {
        stream: {
            partialObjectStream: (async function* (): AsyncGenerator<unknown> {
                throw new Error("the provider hung up");
            })(),
            object,
        },
        claimed: () => claimed,
    };
}

const brief = (extra: Partial<GenerateInput> = {}): GenerateInput => ({
    prompt: "A launch deck for a calm operating system",
    surface: "deck",
    theme: "studio",
    ...extra,
});

const plan = (input: GenerateInput): Promise<{ beats: unknown[] }> =>
    drain(makeContext({ image: {} }).use(planOutlineTool, input)) as Promise<{ beats: unknown[] }>;

describe("the designs a picked starter lends the plan", () => {
    beforeEach(() => {
        vi.mocked(streamObject).mockReset();
    });

    it("leaves the planner's own layouts alone when nothing was picked", async () => {
        vi.mocked(streamObject).mockReturnValue(planned(3) as ReturnType<typeof streamObject>);
        const out = await plan(brief());
        expect(out.beats.map((b) => (b as { layout: string }).layout)).toEqual([
            "two-col",
            "two-col",
            "two-col",
        ]);
    });

    it("snaps a beat onto the design it named, whatever layout the planner answered", async () => {
        const forms = sectionForms(templateBody(STARTER)!);
        const picked = [forms[2]!, forms[0]!, forms[4]!];
        vi.mocked(streamObject).mockReturnValue(
            planned(
                picked.length,
                picked.map((f) => f.id),
            ) as ReturnType<typeof streamObject>,
        );
        const out = await plan(brief({ shapeTemplateId: STARTER }));
        expect(out.beats.map((b) => (b as { layout: string }).layout)).toEqual(
            picked.map((f) => f.layout),
        );
        expect(out.beats.map((b) => (b as { blocks: string[] }).blocks)).toEqual(
            picked.map((f) => f.blocks),
        );
        expect(out.beats.map((b) => (b as { image: boolean }).image)).toEqual(
            picked.map((f) => f.image),
        );
    });

    it("lends a catalog, not a running order: one design serves as many beats as name it", async () => {
        const forms = sectionForms(templateBody(STARTER)!);
        const one = forms[1]!;
        vi.mocked(streamObject).mockReturnValue(
            planned(3, [one.id, one.id, one.id]) as ReturnType<typeof streamObject>,
        );
        const out = await plan(brief({ shapeTemplateId: STARTER }));
        expect(out.beats.map((b) => (b as { layout: string }).layout)).toEqual([
            one.layout,
            one.layout,
            one.layout,
        ]);
    });

    it("keeps the story the planner's: only the three shape fields are taken", async () => {
        const forms = sectionForms(templateBody(STARTER)!);
        vi.mocked(streamObject).mockReturnValue(
            planned(2, [forms[0]!.id, forms[1]!.id]) as ReturnType<typeof streamObject>,
        );
        const out = await plan(brief({ shapeTemplateId: STARTER }));
        const first = out.beats[0] as { label: string; role: string; points: string[] };
        expect(first.label).toBe("Beat 1");
        expect(first.role).toBe("proof");
        expect(first.points).toEqual(["one", "two"]);
    });

    it("leaves a beat that named no design on the layout the planner chose", async () => {
        const forms = sectionForms(templateBody(STARTER)!);
        vi.mocked(streamObject).mockReturnValue(
            planned(2, [forms[0]!.id]) as ReturnType<typeof streamObject>,
        );
        const out = await plan(brief({ shapeTemplateId: STARTER }));
        expect((out.beats[0] as { layout: string }).layout).toBe(forms[0]!.layout);
        expect((out.beats[1] as { layout: string }).layout).toBe("two-col");
    });

    it("leaves a beat naming a design the library does not have alone", async () => {
        vi.mocked(streamObject).mockReturnValue(
            planned(1, ["no-such-design"]) as ReturnType<typeof streamObject>,
        );
        const out = await plan(brief({ shapeTemplateId: STARTER }));
        expect((out.beats[0] as { layout: string }).layout).toBe("two-col");
    });

    // A rejected `object` that nobody awaits is an unhandled rejection, and node ends the process
    // on those, so one model hanging up could take the whole API server down mid-generation.
    it("claims both halves of a dying stream, so nothing rejects unhandled", async () => {
        // a fresh one per attempt: handing the same spent stream back would let the retry claim
        // the first attempt's `object` by accident, and the test would pass on broken code
        const first = dying();
        const second = dying();
        vi.mocked(streamObject)
            .mockReturnValueOnce(first.stream as ReturnType<typeof streamObject>)
            .mockReturnValue(second.stream as ReturnType<typeof streamObject>);
        await expect(plan(brief())).rejects.toThrow(/could not be planned/);
        expect([first.claimed(), second.claimed()]).toEqual([true, true]);
    });

    it("does not retry once the signal is spent, whatever the failure was called", async () => {
        const ac = new AbortController();
        vi.mocked(streamObject).mockImplementation((() => {
            ac.abort(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
            return dying().stream as ReturnType<typeof streamObject>;
        }) as typeof streamObject);
        await expect(
            drain(
                makeContext({ image: {}, signal: ac.signal }).use(planOutlineTool, brief()),
            ) as Promise<unknown>,
        ).rejects.toThrow(/hung up/);
        expect(vi.mocked(streamObject)).toHaveBeenCalledTimes(1);
    });

    it("plans as it would have anyway for a starter id it does not recognise", async () => {
        vi.mocked(streamObject).mockReturnValue(planned(2) as ReturnType<typeof streamObject>);
        const out = await plan(brief({ shapeTemplateId: "no-such-starter" }));
        expect((out.beats[0] as { layout: string }).layout).toBe("two-col");
    });
});

// The blank-board bug: a model returned beats carrying only id/label/role, which satisfied every
// check and painted empty cards. The schema cannot express "planned something", so the outline is
// judged once more after the stream closes.
describe("an outline with nothing in it", () => {
    beforeEach(() => {
        vi.mocked(streamObject).mockReset();
    });

    const bare = (n: number): ReturnType<typeof planned> => ({
        partialObjectStream: (async function* (): AsyncGenerator<unknown> {})(),
        object: Promise.resolve({
            title: "A scripted plan",
            backdrop: "a quiet harbour at dusk",
            beats: Array.from({ length: n }, (_, i) => ({
                id: `s${i + 1}`,
                label: `Beat ${i + 1}`,
                role: "proof",
            })),
        }),
    });

    it("passes an outline whose beats say something", () => {
        expect(
            outlineProblem({
                beats: [{ id: "s1", label: "L", role: "proof", brief: "b" }],
            } as never),
        ).toBeNull();
    });

    it("catches beats with no takeaway, points or brief", () => {
        const beats = [
            { id: "s1", label: "L", role: "proof", takeaway: "a point" },
            { id: "s2", label: "L", role: "proof" },
            { id: "s3", label: "L", role: "proof" },
        ];
        expect(outlineProblem({ beats } as never)).toBe(
            "2 of 3 sections came back with nothing to say",
        );
    });

    it("tolerates one spare beat among several", () => {
        const beats = [
            { id: "s1", label: "L", role: "proof", points: ["a"] },
            { id: "s2", label: "L", role: "proof", brief: "b" },
            { id: "s3", label: "L", role: "proof" },
        ];
        expect(outlineProblem({ beats } as never)).toBeNull();
    });

    // the run must say so rather than hand the board empty cards
    it("fails the run, naming the remedy, after the one retry", async () => {
        vi.mocked(streamObject).mockReturnValue(bare(3) as ReturnType<typeof streamObject>);
        await expect(plan(brief())).rejects.toThrow(/could not be planned.*different model/s);
        expect(vi.mocked(streamObject)).toHaveBeenCalledTimes(2);
    });
});
