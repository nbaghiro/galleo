import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { generateObject } from "ai";
import { sectionForms } from "@model/artifact";
import type { GenerateInput } from "@model/ai";
import { drain, makeContext } from "@services/core/ai/tools";
import { planOutlineTool } from "@services/core/ai/tools/plan";
import { templateBody } from "@services/core/templates";

// The one seam is the model call, so what runs under it is the real planner: this proves the shape
// is enforced rather than merely asked for, which is the whole point of snapping after the reply.
vi.mock("ai", async (importOriginal) => {
    const actual = await importOriginal<typeof import("ai")>();
    return { ...actual, generateObject: vi.fn() };
});

beforeAll(() => vi.stubEnv("GALLEO_FAKE_AI", "1"));
afterAll(() => vi.unstubAllEnvs());

const STARTER = "startup-pitch";

// deliberately the wrong shape everywhere, so anything that matches the starter came from the snap
const planned = (n: number): { object: unknown } => ({
    object: {
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
        })),
    },
});

const brief = (extra: Partial<GenerateInput> = {}): GenerateInput => ({
    prompt: "A launch deck for a calm operating system",
    surface: "deck",
    theme: "studio",
    ...extra,
});

const plan = (input: GenerateInput): Promise<{ beats: unknown[] }> =>
    drain(makeContext({ image: {} }).use(planOutlineTool, input)) as Promise<{ beats: unknown[] }>;

describe("the shape a picked starter lends the plan", () => {
    beforeEach(() => {
        vi.mocked(generateObject).mockReset();
    });

    it("leaves the planner's own layouts alone when nothing was picked", async () => {
        vi.mocked(generateObject).mockResolvedValue(
            planned(3) as Awaited<ReturnType<typeof generateObject>>,
        );
        const out = await plan(brief());
        expect(out.beats.map((b) => (b as { layout: string }).layout)).toEqual([
            "two-col",
            "two-col",
            "two-col",
        ]);
    });

    it("snaps every beat onto the starter's shape, whatever the planner answered", async () => {
        const forms = sectionForms(templateBody(STARTER)!);
        vi.mocked(generateObject).mockResolvedValue(
            planned(forms.length) as Awaited<ReturnType<typeof generateObject>>,
        );
        const out = await plan(brief({ shapeTemplateId: STARTER }));
        expect(out.beats.map((b) => (b as { layout: string }).layout)).toEqual(
            forms.map((f) => f.layout),
        );
        expect(out.beats.map((b) => (b as { blocks: string[] }).blocks)).toEqual(
            forms.map((f) => f.blocks),
        );
        expect(out.beats.map((b) => (b as { image: boolean }).image)).toEqual(
            forms.map((f) => f.image),
        );
    });

    it("keeps the story the planner's: only the three shape fields are taken", async () => {
        vi.mocked(generateObject).mockResolvedValue(
            planned(2) as Awaited<ReturnType<typeof generateObject>>,
        );
        const out = await plan(brief({ shapeTemplateId: STARTER }));
        const first = out.beats[0] as { label: string; role: string; points: string[] };
        expect(first.label).toBe("Beat 1");
        expect(first.role).toBe("proof");
        expect(first.points).toEqual(["one", "two"]);
    });

    it("lets a beat past the starter's last one keep the layout the planner chose", async () => {
        const forms = sectionForms(templateBody(STARTER)!);
        vi.mocked(generateObject).mockResolvedValue(
            planned(forms.length + 2) as Awaited<ReturnType<typeof generateObject>>,
        );
        const out = await plan(brief({ shapeTemplateId: STARTER }));
        expect((out.beats[forms.length] as { layout: string }).layout).toBe("two-col");
    });

    it("plans as it would have anyway for a starter id it does not recognise", async () => {
        vi.mocked(generateObject).mockResolvedValue(
            planned(2) as Awaited<ReturnType<typeof generateObject>>,
        );
        const out = await plan(brief({ shapeTemplateId: "no-such-starter" }));
        expect((out.beats[0] as { layout: string }).layout).toBe("two-col");
    });
});
