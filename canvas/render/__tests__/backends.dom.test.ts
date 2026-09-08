// @vitest-environment happy-dom
import "@elements/register";
import { beforeAll, describe, expect, it } from "vitest";
import type { RenderCommand } from "@engine/node";
import type { Section } from "@model/artifact";
import {
    canvasDrawContext,
    createSectionStackCache,
    fitSlideContent,
    paint,
    paintReconcile,
    paintSectionStack,
    renderSlidePage,
    renderToCanvas,
    sectionFrameHeight,
    sectionLayoutWidth,
} from "@canvas/render/backends";
import { SECTION_GAP } from "@canvas/render/commands";
import { profileFor, resolveProfile } from "@engine/profile";
import { inst, installCanvas2D, sectionOf, textMetricsCtx, tokens } from "@canvas/testkit";

beforeAll(() => installCanvas2D());

describe("paint / applyCommand", () => {
    it("returns the nodes it created, index-parallel to the commands", () => {
        const host = document.createElement("div");
        const commands: RenderCommand[] = [
            { kind: "rect", box: { x: 0, y: 0, w: 10, h: 10 }, fill: { color: "#000" } },
            { kind: "rect", box: { x: 0, y: 10, w: 10, h: 10 }, fill: { color: "#fff" } },
        ];
        const nodes = paint(commands, host);
        expect(nodes).toHaveLength(2);
        expect(nodes.map((n) => n.style.top)).toEqual(["0px", "10px"]);
        expect([...host.children]).toEqual(nodes);
    });

    it("paints one absolutely-positioned div per command with its box + fill", () => {
        const host = document.createElement("div");
        paint(
            [
                {
                    kind: "rect",
                    box: { x: 10, y: 20, w: 100, h: 40 },
                    fill: { color: "#abcdef", radius: 6 },
                },
            ],
            host,
        );
        expect(host.children).toHaveLength(1);
        const el = host.children[0] as HTMLElement;
        expect(el.style.position).toBe("absolute");
        expect(el.style.left).toBe("10px");
        expect(el.style.width).toBe("100px");
        expect(el.style.background).toBe("#abcdef");
        expect(el.style.borderRadius).toBe("6px");
    });
    it("emits a clip-path inset for a clipped command", () => {
        const cmd: RenderCommand = {
            kind: "rect",
            box: { x: 0, y: 0, w: 100, h: 100 },
            fill: { color: "#000" },
            clip: { x: 0, y: 0, w: 100, h: 60 },
        };
        const host = document.createElement("div");
        paint([cmd], host);
        expect((host.children[0] as HTMLElement).style.clipPath).toBe("inset(0px 0px 40px 0px)");
    });
    it("paints a text command's content", () => {
        const host = document.createElement("div");
        paint(
            [
                {
                    kind: "text",
                    box: { x: 0, y: 0, w: 100, h: 20 },
                    text: { text: "hi there", fontId: "f", size: 12, wrap: "words" },
                },
            ],
            host,
        );
        expect((host.children[0] as HTMLElement).textContent).toContain("hi there");
    });
    it("paints an image command as a background image with a radius", () => {
        const host = document.createElement("div");
        paint(
            [
                {
                    kind: "image",
                    box: { x: 0, y: 0, w: 100, h: 100 },
                    image: { src: "p.png", fit: "cover", radius: 8 },
                },
            ],
            host,
        );
        const el = host.children[0] as HTMLElement;
        expect(el.style.backgroundImage).toContain("p.png");
        expect(el.style.borderRadius).toBe("8px");
    });
});

describe("image focal point", () => {
    const img = (extra: Record<string, unknown> = {}): RenderCommand => ({
        kind: "image",
        box: { x: 0, y: 0, w: 100, h: 100 },
        image: { src: "p.png", fit: "cover", ...extra },
    });

    it("paints background-position from the focal point, centred when absent", () => {
        const host = document.createElement("div");
        const [plain, focused] = paint([img(), img({ focus: { x: 0.25, y: 1 } })], host);
        expect(plain!.style.backgroundPosition).toBe("center center"); // the DOM's serialized form
        expect(focused!.style.backgroundPosition).toBe("25% 100%");
    });

    it("a zoomed image crops toward the focal point: object-position and transform-origin agree", () => {
        const host = document.createElement("div");
        const [node] = paint([img({ zoom: 2, focus: { x: 0, y: 0.5 } })], host);
        const inner = node!.querySelector("img")!;
        expect(inner.style.objectPosition).toBe("0% 50%");
        expect(inner.style.transformOrigin).toBe("0% 50%");
    });
});

// a 176px tile has no use for the editor's copy of a photo; the surface says so, the backend obeys
describe("thumb-grade assets", () => {
    const photo = (extra: Record<string, unknown> = {}): RenderCommand => ({
        kind: "image",
        box: { x: 0, y: 0, w: 100, h: 100 },
        image: { src: "full.jpg", thumb: "small.jpg", fit: "cover", ...extra },
    });

    it("paints the full asset by default, and the thumb where the surface asked for one", () => {
        const full = paint([photo()], document.createElement("div"))[0]!;
        expect(full.style.backgroundImage).toContain("full.jpg");
        const small = paint([photo()], document.createElement("div"), "thumb")[0]!;
        expect(small.style.backgroundImage).toContain("small.jpg");
    });

    it("falls back to the full asset when the source offered no small copy", () => {
        const cmd: RenderCommand = {
            kind: "image",
            box: { x: 0, y: 0, w: 100, h: 100 },
            image: { src: "only.jpg", fit: "cover" },
        };
        const el = paint([cmd], document.createElement("div"), "thumb")[0]!;
        expect(el.style.backgroundImage).toContain("only.jpg");
    });

    it("reaches the zoomed <img> path and the reconciler too", () => {
        const zoomed = paint([photo({ zoom: 2 })], document.createElement("div"), "thumb")[0]!;
        expect(zoomed.querySelector("img")!.getAttribute("src")).toBe("small.jpg");
        const host = document.createElement("div");
        paintReconcile(host, [photo({ zoom: 2 })], "thumb");
        expect(host.querySelector("img")!.getAttribute("src")).toBe("small.jpg");
    });

    it("a stack passes its choice down: the plate gets the thumb, the editor the full asset", () => {
        const sections = [
            sectionOf(inst("image", { src: "full.jpg", thumbSrc: "small.jpg" }), { id: "s1" }),
        ];
        const src = (assets?: "full" | "thumb"): string => {
            const host = document.createElement("div");
            paintSectionStack(host, sections, resolveProfile("deck"), tokens, {
                fullW: 1000,
                ...(assets ? { assets } : {}),
            });
            return host.innerHTML;
        };
        expect(src("thumb")).toContain("small.jpg");
        expect(src("thumb")).not.toContain("full.jpg");
        expect(src()).toContain("full.jpg");
        expect(src()).not.toContain("small.jpg");
    });
});

describe("inline label hiding", () => {
    it("hideId with a label: prefix hides the button's label text, nothing else", () => {
        const host = document.createElement("div");
        const sections = [sectionOf(inst("button", { label: "Reserve now" }), { id: "s1" })];
        const opts = { fullW: 1000, hideId: "label:el:s1" };
        paintSectionStack(host, sections, resolveProfile("deck"), tokens, opts);
        expect(host.textContent).not.toContain("Reserve now");
        const host2 = document.createElement("div");
        paintSectionStack(host2, sections, resolveProfile("deck"), tokens, { fullW: 1000 });
        expect(host2.textContent).toContain("Reserve now");
    });
});

describe("rotation", () => {
    it("paints the transform about the shared center", () => {
        const host = document.createElement("div");
        const [el] = paint(
            [
                {
                    kind: "rect",
                    box: { x: 80, y: 90, w: 40, h: 20 },
                    fill: { color: "#000" },
                    rotate: { deg: 30, cx: 100, cy: 100 },
                },
            ],
            host,
        );
        expect(el!.style.transform).toBe("rotate(30deg)");
        expect(el!.style.transformOrigin).toBe("20px 10px");
    });

    it("keeps an ancestor clip stage-aligned by counter-turning it into local space", () => {
        const host = document.createElement("div");
        const [el] = paint(
            [
                {
                    kind: "rect",
                    box: { x: 80, y: 90, w: 40, h: 20 },
                    fill: { color: "#000" },
                    clip: { x: 80, y: 90, w: 40, h: 20 },
                    rotate: { deg: 90, cx: 100, cy: 100 },
                },
            ],
            host,
        );
        // the stage rect mapped through the inverse turn: a polygon, not a box-relative inset
        expect(el!.style.clipPath).toContain("polygon");
        // 90° back-rotation of the box's own corners about (20,10): (0,0) → (10,30)
        expect(el!.style.clipPath).toContain("10px 30px");
    });

    it("a reused element sheds a stale transform", () => {
        const host = document.createElement("div");
        paint(
            [
                {
                    kind: "rect",
                    box: { x: 0, y: 0, w: 10, h: 10 },
                    fill: { color: "#000" },
                    rotate: { deg: 45, cx: 5, cy: 5 },
                },
            ],
            host,
        );
        const [el] = paint(
            [{ kind: "rect", box: { x: 0, y: 0, w: 10, h: 10 }, fill: { color: "#000" } }],
            host,
        );
        expect(el!.style.transform).toBe("");
    });
});

// what the minimap thumb repaints through: an edit must not rebuild the rail's subtree
describe("paintReconcile", () => {
    const two = (a: string, b: string): RenderCommand[] => [
        { kind: "rect", box: { x: 0, y: 0, w: 10, h: 10 }, fill: { color: a } },
        { kind: "rect", box: { x: 0, y: 10, w: 10, h: 10 }, fill: { color: b } },
    ];

    it("keeps the nodes it already has across a repaint", () => {
        const host = document.createElement("div");
        const first = paintReconcile(host, two("#000", "#fff"));
        const second = paintReconcile(host, two("#111", "#fff"));
        expect(second[0]).toBe(first[0]);
        expect(second[1]).toBe(first[1]);
        expect(second[0]!.style.background).toBe("#111");
    });

    it("drops the surplus when the commands shrink, and empties the host at zero", () => {
        const host = document.createElement("div");
        paintReconcile(host, two("#000", "#fff"));
        paintReconcile(host, [two("#000", "#fff")[0]!]);
        expect(host.children).toHaveLength(1);
        // the rail releases a thumb this way, and the host's own box survives it
        host.style.height = "80px";
        paintReconcile(host, []);
        expect(host.children).toHaveLength(0);
        expect(host.style.height).toBe("80px");
    });
});

describe("canvasDrawContext", () => {
    it("adapts measureText through the 2D context", () => {
        expect(canvasDrawContext(textMetricsCtx()).measureText("hello", { size: 12 }).width).toBe(
            40,
        );
    });
});

describe("renderToCanvas / renderSlidePage (raster smoke)", () => {
    const cmds: RenderCommand[] = [
        { kind: "rect", box: { x: 0, y: 0, w: 50, h: 50 }, fill: { color: "#000", radius: 4 } },
    ];
    it("renderToCanvas produces a canvas without throwing", async () => {
        expect(await renderToCanvas(cmds, 100, 100, "#fff", 1)).toBeInstanceOf(HTMLCanvasElement);
    });
    it("renderSlidePage produces a canvas without throwing", async () => {
        const canvas = await renderSlidePage(
            { commands: cmds, w: 1280, h: 720, contentH: 1440 },
            "#fff",
            1,
        );
        expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    });
});

describe("paintSectionStack", () => {
    it("stacks sections and reports tops, total height, and regions", () => {
        const host = document.createElement("div");
        const sections = [
            sectionOf(inst("text", { text: "A" }), { id: "s1" }),
            sectionOf(inst("text", { text: "B" }), { id: "s2" }),
        ];
        const { tops, height, regions } = paintSectionStack(
            host,
            sections,
            resolveProfile("deck"),
            tokens,
            { fullW: 1000 },
        );
        expect(host.children).toHaveLength(2);
        expect(tops[0]).toBe(0);
        expect(tops[1]).toBeGreaterThan(0);
        expect(height).toBeGreaterThan(tops[1]!);
        expect(regions.some((r) => r.id === "section:s1")).toBe(true);
    });
    it("carries the painted radius through to the published regions", () => {
        const host = document.createElement("div");
        const sections = [
            sectionOf(inst("image", { src: "https://x/img.png", radius: 14 }), { id: "s1" }),
        ];
        const { regions } = paintSectionStack(host, sections, resolveProfile("deck"), tokens, {
            fullW: 1000,
        });
        const img = regions.find((r) => r.id === "el:s1");
        expect(img?.radius).toBe(14);
    });
});

describe("paintSectionStack — element sticky", () => {
    const web = resolveProfile("web");
    const stickSection = (id: string, stick: "top" | "page"): Section =>
        sectionOf(
            {
                type: "container",
                data: {
                    direction: "col",
                    children: [
                        { type: "text", data: { text: "held" }, layout: { stick } },
                        { type: "text", data: { text: "body under it" } },
                    ],
                },
            },
            { id },
        );
    const draw = (sections: Section[], playback = true) => {
        const host = document.createElement("div");
        const res = paintSectionStack(host, sections, web, tokens, {
            fullW: 1000,
            ...(playback ? { pinned: true } : {}),
        });
        return { host, res };
    };
    const carriers = (host: HTMLElement): HTMLElement[] =>
        [...host.children].filter((c) => (c as HTMLElement).dataset.stick) as HTMLElement[];

    it("playback builds one carrier per sticky element, after the section layers", () => {
        const { host, res } = draw([stickSection("s1", "top")]);
        const cs = carriers(host);
        expect(cs).toHaveLength(1);
        const carrier = cs[0]!;
        // a top-scoped carrier spans exactly its section, so containment ends the stick there
        expect(carrier.style.top).toBe("0px");
        expect(parseFloat(carrier.style.height)).toBeCloseTo(res.heights[0]!, 1);
        expect(carrier.style.pointerEvents).toBe("none");
        const wrapper = carrier.firstElementChild as HTMLElement;
        expect(wrapper.style.position).toBe("sticky");
        expect(wrapper.style.pointerEvents).toBe("auto");
        // the inner offset makes the proxy pixel-identical over the original at rest
        const el = res.regions.find((r) => r.id === "el:s1:0")!;
        expect(parseFloat(wrapper.style.marginTop)).toBeCloseTo(el.box.y, 1);
        const inner = wrapper.firstElementChild as HTMLElement;
        expect(parseFloat(inner.style.top)).toBeCloseTo(-el.box.y, 1);
        expect(inner.children.length).toBeGreaterThan(0);
    });

    it("hides the original's nodes while the proxy stands over them", () => {
        const { res } = draw([stickSection("s1", "top")]);
        const layer = res.layers[0]!;
        const hidden = layer.nodes.filter((n) => n.style.visibility === "hidden");
        expect(hidden.length).toBeGreaterThan(0);
    });

    it("builds nothing without the playback flag, and hides nothing", () => {
        const { host, res } = draw([stickSection("s1", "top")], false);
        expect(carriers(host)).toHaveLength(0);
        expect(res.layers[0]!.nodes.every((n) => n.style.visibility !== "hidden")).toBe(true);
        expect(res.sticky).toHaveLength(0);
    });

    it("a page carrier runs from the element to the stack bottom; two accumulate offset", () => {
        const { host, res } = draw([
            stickSection("s1", "page"),
            sectionOf(inst("text", { text: "mid" }), { id: "s2" }),
            stickSection("s3", "page"),
        ]);
        const cs = carriers(host);
        expect(cs).toHaveLength(2);
        const first = cs[0]!;
        const el1 = res.sticky.find((e) => e.key === "el:s1:0")!;
        expect(parseFloat(first.style.top)).toBeCloseTo(el1.box.y, 1);
        expect(parseFloat(first.style.height)).toBeCloseTo(res.height - el1.box.y, 1);
        const w1 = first.firstElementChild as HTMLElement;
        const w2 = cs[1]!.firstElementChild as HTMLElement;
        expect(w1.style.top).toBe("0px");
        // the accumulator advances by the DETACHED bar height (the app-bar minimum applies), so
        // whatever sticks below never tucks under the grounded bar
        const el1H = res.sticky.find((e) => e.key === "el:s1:0")!.box.h;
        expect(parseFloat(w2.style.top)).toBeCloseTo(Math.max(el1H + 20, 48), 1);
    });

    it("a section-scoped sticky rests below the page bar and never paints over it", () => {
        const { host } = draw([stickSection("s1", "page"), stickSection("s2", "top")]);
        const cs = carriers(host);
        expect(cs).toHaveLength(2);
        const pageC = cs.find((c) => c.dataset.stick === "page")!;
        const topC = cs.find((c) => c.dataset.stick === "top")!;
        const topWrap = topC.firstElementChild as HTMLElement;
        // below the detached bar, not the resting strip
        expect(parseFloat(topWrap.style.top)).toBeGreaterThanOrEqual(48);
        // the page bar rides above every section-scoped carrier
        expect(parseInt(pageC.style.zIndex)).toBeGreaterThan(parseInt(topC.style.zIndex));
    });

    it("a section holding a page-scoped element stays materialized outside the window", () => {
        const host = document.createElement("div");
        const sections = [
            stickSection("s1", "page"),
            sectionOf(inst("text", { text: "far below" }), { id: "s2" }),
        ];
        const res = paintSectionStack(host, sections, web, tokens, {
            fullW: 1000,
            pinned: true,
            cache: createSectionStackCache(),
            window: { top: 100000, bottom: 101000 },
        });
        expect(res.layers.some((l) => l.id === "s1")).toBe(true);
    });
});

describe("paintSectionStack — stuck inset and bar chrome", () => {
    const web = resolveProfile("web");
    const navSection = (extra: Record<string, unknown>): Section =>
        sectionOf(
            {
                type: "container",
                data: {
                    direction: "col",
                    children: [
                        {
                            type: "text",
                            data: { text: "nav" },
                            layout: { stick: "page", ...extra },
                        },
                        { type: "text", data: { text: "body" } },
                    ],
                },
            },
            { id: "s1" },
        );
    const draw = (extra: Record<string, unknown>) => {
        const host = document.createElement("div");
        const res = paintSectionStack(host, [navSection(extra)], web, tokens, {
            fullW: 1000,
            pinned: true,
        });
        const carrier = [...host.children].find(
            (c) => (c as HTMLElement).dataset.stick,
        ) as HTMLElement;
        return { host, res, carrier, wrapper: carrier?.firstElementChild as HTMLElement };
    };

    it("the inset moves the stuck resting line down, and rides the carriage offset", () => {
        const { res, wrapper } = draw({ stickInset: 16 });
        expect(wrapper.style.top).toBe("16px");
        expect(res.sticky[0]!.offset).toBe(16);
    });

    // production reads only isIntersecting off the last entry, so the fake reports just that
    type SentinelEntry = Pick<IntersectionObserverEntry, "isIntersecting">;
    class FakeObserver implements IntersectionObserver {
        static seen: FakeObserver[] = [];
        readonly root = null;
        readonly rootMargin = "";
        readonly thresholds: readonly number[] = [];
        constructor(public cb: IntersectionObserverCallback) {
            FakeObserver.seen.push(this);
        }
        fire(isIntersecting: boolean): void {
            (this.cb as (e: SentinelEntry[], o: IntersectionObserver) => void)(
                [{ isIntersecting }],
                this,
            );
        }
        observe(): void {}
        disconnect(): void {}
        unobserve(): void {}
        takeRecords(): IntersectionObserverEntry[] {
            return [];
        }
    }

    it("the sticky top never absorbs the element's own height across observer dresses", () => {
        // dress() must not read the accumulator the loop keeps advancing: the observer fires
        // after the loop, when the accumulator already includes this element's own extent
        const Orig = globalThis.IntersectionObserver;
        FakeObserver.seen = [];
        globalThis.IntersectionObserver = FakeObserver;
        try {
            const { wrapper } = draw({});
            expect(wrapper.style.top).toBe("0px");
            FakeObserver.seen[0]!.fire(false);
            expect(wrapper.style.top).toBe("0px");
            FakeObserver.seen[0]!.fire(true);
            expect(wrapper.style.top).toBe("0px");
        } finally {
            globalThis.IntersectionObserver = Orig;
        }
    });

    it("a bar-flagged element grows a sentinel and detaches into theme chrome", () => {
        const Orig = globalThis.IntersectionObserver;
        FakeObserver.seen = [];
        globalThis.IntersectionObserver = FakeObserver;
        try {
            const { carrier, wrapper } = draw({ stickBar: true });
            expect(FakeObserver.seen).toHaveLength(1);
            // past the sentinel: the bar chrome applies, full width, theme ground
            FakeObserver.seen[0]!.fire(false);
            expect(carrier.dataset.stuck).toBe("1");
            expect(wrapper.style.marginLeft).toBe("0px");
            expect(parseFloat(wrapper.style.width)).toBe(1000);
            expect(wrapper.style.background).not.toBe("");
            // back at rest: pixel-identical again
            FakeObserver.seen[0]!.fire(true);
            expect(carrier.dataset.stuck).toBeUndefined();
            expect(wrapper.style.background).toBe("");
        } finally {
            globalThis.IntersectionObserver = Orig;
        }
    });

    // flipped again (user feedback on the transparent nav): a detached page-stuck element gets
    // an app-bar ground by default — opaque surface, hairline, a small min height with the
    // element centred — at the element's own width; the bar flag keeps the full-bleed variant
    it("a bare page-stuck element detaches into an app-bar ground at its own width", () => {
        const Orig = globalThis.IntersectionObserver;
        FakeObserver.seen = [];
        globalThis.IntersectionObserver = FakeObserver;
        try {
            const { carrier, wrapper } = draw({});
            expect(FakeObserver.seen).toHaveLength(1);
            FakeObserver.seen[0]!.fire(false);
            expect(carrier.dataset.stuck).toBe("1");
            expect(wrapper.style.borderBottom).not.toBe("");
            expect(wrapper.style.background).not.toBe("");
            expect(wrapper.style.marginLeft).not.toBe("0px");
            expect(parseFloat(wrapper.style.height)).toBeGreaterThanOrEqual(48);
            FakeObserver.seen[0]!.fire(true);
            expect(wrapper.style.borderBottom).toBe("");
            expect(wrapper.style.background).toBe("");
            expect(parseFloat(wrapper.style.height)).toBeLessThan(48);
        } finally {
            globalThis.IntersectionObserver = Orig;
        }
    });

    it("a section-scoped element grows no sentinel", () => {
        const Orig = globalThis.IntersectionObserver;
        FakeObserver.seen = [];
        globalThis.IntersectionObserver = FakeObserver;
        try {
            const host = document.createElement("div");
            paintSectionStack(
                host,
                [
                    sectionOf(
                        {
                            type: "container",
                            data: {
                                direction: "col",
                                children: [
                                    {
                                        type: "text",
                                        data: { text: "head" },
                                        layout: { stick: "top" },
                                    },
                                    { type: "text", data: { text: "body" } },
                                ],
                            },
                        },
                        { id: "s1" },
                    ),
                ],
                web,
                tokens,
                { fullW: 1000, pinned: true },
            );
            expect(FakeObserver.seen).toHaveLength(0);
        } finally {
            globalThis.IntersectionObserver = Orig;
        }
    });
});

describe("paintSectionStack — slide framing", () => {
    const deck = resolveProfile("deck");
    const short = (): Section[] => [sectionOf(inst("text", { text: "A" }), { id: "s1" })];
    const tall = (): Section[] => [
        sectionOf(
            {
                type: "container",
                data: {
                    direction: "col",
                    children: Array.from({ length: 40 }, (_, i) =>
                        inst("text", { text: `Paragraph ${i}` }),
                    ),
                },
            },
            { id: "s1" },
        ),
    ];
    const draw = (sections: Section[], slide: boolean): ReturnType<typeof paintSectionStack> =>
        paintSectionStack(document.createElement("div"), sections, deck, tokens, {
            fullW: 1000,
            slideFrame: slide,
        });

    it("pads a short section out to its frame instead of hugging the content", () => {
        const natural = draw(short(), false).heights[0]!;
        const framed = draw(short(), true).heights[0]!;
        const layoutW = sectionLayoutWidth(short()[0]!, deck, 1000);
        expect(framed).toBeGreaterThan(natural);
        expect(framed).toBe(sectionFrameHeight(short()[0]!, deck, layoutW));
    });

    it("lets a section taller than its frame keep growing", () => {
        const layoutW = sectionLayoutWidth(tall()[0]!, deck, 1000);
        expect(draw(tall(), true).heights[0]!).toBeGreaterThan(
            sectionFrameHeight(tall()[0]!, deck, layoutW),
        );
    });

    it("keeps selectable regions, so framing does not cost selection", () => {
        expect(draw(short(), true).regions.some((r) => r.id === "section:s1")).toBe(true);
    });

    it("is inert for continuous formats", () => {
        const doc = resolveProfile("doc");
        const host = (slide: boolean): number =>
            paintSectionStack(document.createElement("div"), short(), doc, tokens, {
                fullW: 1000,
                slideFrame: slide,
            }).heights[0]!;
        expect(host(true)).toBe(host(false));
    });

    it("repaints when the mode flips, rather than serving the cached layer", () => {
        const cache = createSectionStackCache();
        const host = document.createElement("div");
        const same = short(); // one identity across draws, so only the mode can miss the cache
        const run = (slide: boolean): number =>
            paintSectionStack(host, same, deck, tokens, { fullW: 1000, cache, slideFrame: slide })
                .heights[0]!;
        const natural = run(false);
        expect(run(true)).toBeGreaterThan(natural);
        expect(run(false)).toBe(natural);
    });
});

describe("paintSectionStack — autofit", () => {
    const deck = resolveProfile("deck");
    const para = (i: number): string =>
        `Paragraph ${i}: ${"lorem ipsum dolor sit amet consectetur ".repeat(6)}`;
    // 657px natural against a 554px frame: over the frame, under the pagination threshold
    const dense = (n = 6): Section[] => [
        sectionOf(
            {
                type: "container",
                data: {
                    direction: "col",
                    children: [
                        inst("text", { style: "h1", text: "A title" }),
                        ...Array.from({ length: n }, (_, i) =>
                            inst("text", { style: "body", text: para(i) }),
                        ),
                    ],
                },
            },
            { id: "s1" },
        ),
    ];
    const frameH = (): number =>
        sectionFrameHeight(dense()[0]!, deck, sectionLayoutWidth(dense()[0]!, deck, 1000));
    const draw = (
        sections: Section[],
        opts: Partial<Parameters<typeof paintSectionStack>[4]> = {},
    ): ReturnType<typeof paintSectionStack> =>
        paintSectionStack(document.createElement("div"), sections, deck, tokens, {
            fullW: 1000,
            slideFrame: true,
            ...opts,
        });
    const hairlines = (r: ReturnType<typeof paintSectionStack>): number =>
        r.layers[0]!.commands.filter((c) => c.box.h === 1 && c.box.y === frameH()).length;

    it("reports the scale each section was painted at", () => {
        const r = draw(dense());
        expect(r.fitScales[0]).toBeLessThan(1);
        expect(Math.round(r.heights[0]!)).toBe(frameH());
    });

    it("leaves the overflow hairline for what it cannot fit, and drops it for what it can", () => {
        expect(hairlines(draw(dense()))).toBe(0);
        expect(hairlines(draw(dense(7)))).toBe(1); // past the pagination threshold: not fitted
    });

    it("reports 1 for every section when the stack is not slide-framed", () => {
        expect(draw(dense(), { slideFrame: false }).fitScales).toEqual([1]);
    });

    it("holds a frozen scale for the section carrying an inline edit, then re-solves", () => {
        const cache = createSectionStackCache();
        const host = document.createElement("div");
        const same = dense(); // one identity across draws, so only the freeze can miss the cache
        const run = (freezeFit: { id: string; scale: number } | null): [number, number] => {
            const r = paintSectionStack(host, same, deck, tokens, {
                fullW: 1000,
                slideFrame: true,
                cache,
                freezeFit,
            });
            return [r.fitScales[0]!, Math.round(r.heights[0]!)];
        };
        const [solved, fittedH] = run(null);
        expect(solved).toBeLessThan(1);
        // held at the authored size, so the section spills past its frame rather than resizing type
        expect(run({ id: "s1", scale: 1 })).toEqual([1, 657]);
        expect(run({ id: "other", scale: 1 })).toEqual([solved, fittedH]); // another section's edit
        expect(run(null)).toEqual([solved, fittedH]);
    });
});

const rect = (h: number): RenderCommand => ({
    kind: "rect",
    box: { x: 0, y: 0, w: 100, h },
    fill: { color: "#eee" },
});

describe("paintSectionStack — windowing", () => {
    const many = (n: number): Section[] =>
        Array.from({ length: n }, (_, i) =>
            sectionOf(inst("text", { text: `S${i}` }), { id: `s${i}` }),
        );
    const deck = resolveProfile("deck");
    const draw = (
        host: HTMLElement,
        sections: Section[],
        opts: Parameters<typeof paintSectionStack>[4],
    ): ReturnType<typeof paintSectionStack> =>
        paintSectionStack(host, sections, deck, tokens, opts);

    it("reports the same geometry windowed as unwindowed, and paints only the intersecting band", () => {
        const sections = many(12);
        const full = draw(document.createElement("div"), sections, { fullW: 1000 });
        const host = document.createElement("div");
        const windowed = draw(host, sections, {
            fullW: 1000,
            window: { top: 0, bottom: full.tops[2]! },
        });

        expect(windowed.tops).toEqual(full.tops);
        expect(windowed.height).toBe(full.height);
        expect(windowed.painted).toBeLessThan(full.painted);
        expect(host.children.length).toBe(windowed.painted);
    });

    it("only reports regions for what it painted — nothing off-screen can be hit", () => {
        const sections = many(12);
        const full = draw(document.createElement("div"), sections, { fullW: 1000 });
        const windowed = draw(document.createElement("div"), sections, {
            fullW: 1000,
            window: { top: 0, bottom: full.tops[1]! },
        });
        expect(windowed.regions.some((r) => r.id === "section:s0")).toBe(true);
        expect(windowed.regions.some((r) => r.id === "section:s11")).toBe(false);
        expect(windowed.regions.length).toBeLessThan(full.regions.length);
    });

    it("paints a section as the window reaches it, and releases it once far behind", () => {
        const sections = many(12);
        const cache = createSectionStackCache();
        const host = document.createElement("div");
        const geom = draw(document.createElement("div"), sections, { fullW: 1000 });
        const far = geom.tops[9]!;

        draw(host, sections, { fullW: 1000, cache, window: { top: 0, bottom: geom.tops[1]! } });
        expect(cache.entries.get("s0")?.layer).toBeTruthy();
        expect(cache.entries.get("s9")?.layer).toBeFalsy();

        draw(host, sections, { fullW: 1000, cache, window: { top: far, bottom: geom.height } });
        expect(cache.entries.get("s9")?.layer).toBeTruthy();
        expect(cache.entries.get("s0")?.layer).toBeFalsy(); // DOM released
        expect(cache.entries.get("s0")?.height).toBeGreaterThan(0); // layout kept
    });

    it("reserves a placeholder's height and paints its stand-in", () => {
        const sections = many(3);
        const host = document.createElement("div");
        const stand = { commands: [rect(500)], height: 500 };
        const { tops, height, painted } = draw(host, sections, {
            fullW: 1000,
            pending: (s) => s.id === "s1",
            placeholder: () => stand,
        });
        expect(tops[2]! - tops[1]!).toBe(500 + SECTION_GAP);
        expect(painted).toBe(3); // the stand-in is painted like any other layer
        expect(height).toBeGreaterThan(500);
    });

    it("keeps a placeholder out of the hit-test regions", () => {
        const sections = many(2);
        const { regions } = draw(document.createElement("div"), sections, {
            fullW: 1000,
            pending: (s) => s.id === "s0",
            placeholder: () => ({ commands: [rect(300)], height: 300 }),
        });
        expect(regions.some((r) => r.id === "section:s0")).toBe(false);
        expect(regions.some((r) => r.id === "section:s1")).toBe(true);
    });

    it("leaves the host's child list alone when the window has not moved", () => {
        const sections = many(12);
        const cache = createSectionStackCache();
        const host = document.createElement("div");
        const geom = draw(document.createElement("div"), sections, { fullW: 1000 });
        const win = { top: 0, bottom: geom.tops[3]! };
        draw(host, sections, { fullW: 1000, cache, window: win });

        const mo = new MutationObserver(() => {});
        mo.observe(host, { childList: true });
        draw(host, sections, { fullW: 1000, cache, window: win });
        expect(mo.takeRecords()).toHaveLength(0);

        // and still rewrites it when the band actually moves
        draw(host, sections, {
            fullW: 1000,
            cache,
            window: { top: geom.tops[8]!, bottom: geom.height },
        });
        expect(mo.takeRecords().length).toBeGreaterThan(0);
        mo.disconnect();
    });

    it("lays a stand-in out on a miss only, never on a repaint that reuses the layer", () => {
        const sections = many(3);
        const cache = createSectionStackCache();
        const host = document.createElement("div");
        let laid = 0;
        const opts = {
            fullW: 1000,
            cache,
            pending: () => true,
            placeholder: (): { commands: RenderCommand[]; height: number } => {
                laid++;
                return { commands: [rect(300)], height: 300 };
            },
        };
        draw(host, sections, opts);
        expect(laid).toBe(3);
        draw(host, sections, opts);
        expect(laid).toBe(3); // the repaint served the cache
    });

    it("repaints a section once its content replaces the stand-in", () => {
        const sections = many(1);
        const cache = createSectionStackCache();
        const host = document.createElement("div");
        draw(host, sections, {
            fullW: 1000,
            cache,
            pending: () => true,
            placeholder: () => ({ commands: [rect(400)], height: 400 }),
        });
        expect(cache.entries.get("s0")?.height).toBe(400);
        const real = draw(host, sections, { fullW: 1000, cache });
        expect(cache.entries.get("s0")?.height).not.toBe(400);
        expect(real.regions.some((r) => r.id === "section:s0")).toBe(true);
    });
});

describe("fitSlideContent", () => {
    it("scales content to fit the slide height, centered", () => {
        const { el } = fitSlideContent(
            [{ kind: "rect", box: { x: 0, y: 0, w: 1280, h: 1440 }, fill: { color: "#000" } }],
            1440,
            1280,
            720,
        );
        expect(el.style.transform).toBe("scale(0.5)"); // 720 / 1440
    });
});

describe("paintSectionStack — page-size cache invalidation", () => {
    const deck = resolveProfile("deck");
    const page = (width: number, height: number) =>
        profileFor({ format: "deck", page: { width, height } });

    // layoutW is identical across these profiles, so only the paged dimensions distinguish them
    const paintWith = (
        host: HTMLElement,
        sections: Section[],
        cache: ReturnType<typeof createSectionStackCache>,
        profile: Parameters<typeof paintSectionStack>[2],
    ): void => {
        paintSectionStack(host, sections, profile, tokens, { fullW: 1000, cache });
    };

    it("reuses the cached layer when nothing changed", () => {
        const sections = [sectionOf(inst("text", { text: "A" }), { id: "s1" })];
        const cache = createSectionStackCache();
        const host = document.createElement("div");
        paintWith(host, sections, cache, deck);
        const first = cache.entries.get("s1")!.commands;
        paintWith(host, sections, cache, deck);
        expect(cache.entries.get("s1")!.commands).toBe(first);
    });

    it("re-lays-out when the artifact's page size changes", () => {
        const sections = [sectionOf(inst("text", { text: "A" }), { id: "s1" })];
        const cache = createSectionStackCache();
        const host = document.createElement("div");
        paintWith(host, sections, cache, page(1080, 1080));
        const square = cache.entries.get("s1")!.commands;
        paintWith(host, sections, cache, page(1080, 1920));
        expect(cache.entries.get("s1")!.commands).not.toBe(square);
    });

    it("distinguishes a sized page from the format's own dimensions", () => {
        const sections = [sectionOf(inst("text", { text: "A" }), { id: "s1" })];
        const cache = createSectionStackCache();
        const host = document.createElement("div");
        paintWith(host, sections, cache, deck);
        const plain = cache.entries.get("s1")!.commands;
        paintWith(host, sections, cache, page(1080, 1350));
        expect(cache.entries.get("s1")!.commands).not.toBe(plain);
    });
});

describe("applyCommand — an overlay is read", () => {
    it("a non-decor float command stays in the a11y tree", () => {
        const host = document.createElement("div");
        const [node] = paint(
            [
                {
                    kind: "text",
                    box: { x: 0, y: 0, w: 60, h: 20 },
                    text: { text: "overlay", fontId: "Inter", size: 12, wrap: "none" },
                },
            ],
            host,
        );
        expect(node!.getAttribute("aria-hidden")).toBeNull();
    });
});

describe("applyCommand — decoration is not read", () => {
    const box = { x: 0, y: 0, w: 10, h: 10 };
    const el = (c: RenderCommand): HTMLElement => {
        const host = document.createElement("div");
        return paint([c], host)[0]!;
    };

    it("hides a decor command from the a11y tree", () => {
        expect(
            el({ kind: "rect", box, fill: { color: "#000" }, decor: true }).getAttribute(
                "aria-hidden",
            ),
        ).toBe("true");
        const text = { text: "watermark", fontId: "f", size: 12, wrap: "none" as const };
        expect(el({ kind: "text", box, text, decor: true }).getAttribute("aria-hidden")).toBe(
            "true",
        );
    });

    it("leaves ordinary content alone", () => {
        expect(
            el({ kind: "rect", box, fill: { color: "#000" } }).getAttribute("aria-hidden"),
        ).toBeNull();
    });

    // layers are cached and their nodes reused, so a node that was decoration must not stay hidden
    it("clears the flag when a reused node stops being decoration", () => {
        const host = document.createElement("div");
        const cache = createSectionStackCache();
        const stand = (decor: boolean) => (): { commands: RenderCommand[]; height: number } => ({
            commands: [
                { kind: "rect", box: { ...box, w: 100, h: 40 }, ...(decor ? { decor } : {}) },
            ],
            height: 40,
        });
        const draw = (decor: boolean): void => {
            // a fresh section object per pass, so the cached layer is reconciled rather than reused
            const sec = sectionOf(inst("text", { text: "A" }), { id: "s1" });
            paintSectionStack(host, [sec], resolveProfile("doc"), tokens, {
                fullW: 1000,
                cache,
                pending: () => true,
                placeholder: stand(decor),
            });
        };
        draw(true);
        const node = cache.entries.get("s1")!.layer!.children[0] as HTMLElement;
        expect(node.getAttribute("aria-hidden")).toBe("true");
        draw(false);
        expect(cache.entries.get("s1")!.layer!.children[0]).toBe(node); // reused, not replaced
        expect(node.getAttribute("aria-hidden")).toBeNull();
    });

    // an anchor with no name was already out of the tree; decoration must not undo that
    it("keeps a nameless anchor hidden and a named one visible", () => {
        expect(
            el({ kind: "rect", box, fill: { color: "#000" }, link: "/x" }).getAttribute(
                "aria-hidden",
            ),
        ).toBe("true");
        const text = { text: "Read on", fontId: "f", size: 12, wrap: "none" as const };
        expect(el({ kind: "text", box, text, link: "/x" }).getAttribute("aria-hidden")).toBeNull();
    });
});

describe("paintSectionStack — pinned sections", () => {
    const doc = resolveProfile("doc");
    const sections = (): Section[] => [
        sectionOf(inst("text", { text: "Nav" }), { id: "nav", pinned: true }),
        sectionOf(inst("text", { text: "One" }), { id: "s1" }),
        sectionOf(inst("text", { text: "Two" }), { id: "s2" }),
    ];
    const draw = (
        host: HTMLElement,
        profile = doc,
        opts: Partial<Parameters<typeof paintSectionStack>[4]> = {},
    ): ReturnType<typeof paintSectionStack> =>
        paintSectionStack(host, sections(), profile, tokens, {
            fullW: 1000,
            pinned: true,
            ...opts,
        });

    it("puts the pinned layer in flow at its own slot, and leaves the rest absolute", () => {
        const host = document.createElement("div");
        const { tops } = draw(host);
        const [nav, one] = [...host.children] as HTMLElement[];
        expect(nav!.style.position).toBe("sticky");
        expect(nav!.style.top).toBe("0px");
        expect(nav!.style.marginTop).toBe(`${tops[0]}px`);
        expect(nav!.style.left).toBe(""); // `left` on a sticky box is a stickiness constraint
        expect(one!.style.position).toBe("absolute");
        expect(one!.style.top).toBe(`${tops[1]}px`);
    });

    it("stacks the pinned layer above its siblings", () => {
        const host = document.createElement("div");
        draw(host);
        const [nav, one] = [...host.children] as HTMLElement[];
        expect(nav!.style.zIndex).toBe("1");
        expect(one!.style.zIndex).toBe("");
    });

    it("displaces nothing: tops and total height match an unpinned stack", () => {
        const pinned = draw(document.createElement("div"));
        const plain = draw(document.createElement("div"), doc, { pinned: false });
        expect(pinned.tops).toEqual(plain.tops);
        expect(pinned.height).toBe(plain.height);
    });

    it("keeps the pinned layer alive however far past its slot the reader has scrolled", () => {
        const host = document.createElement("div");
        const cache = createSectionStackCache();
        const geom = draw(document.createElement("div"));
        const far = geom.height + 5000;
        draw(host, doc, { cache, window: { top: far, bottom: far + 800 } });
        expect(cache.entries.get("nav")?.layer).toBeTruthy();
        expect(cache.entries.get("s1")?.layer).toBeFalsy();
        expect([...host.children]).toContain(cache.entries.get("nav")?.layer);
    });

    it("is ignored by a paged format, which has no scroll to stick against", () => {
        const host = document.createElement("div");
        draw(host, resolveProfile("deck"));
        expect((host.children[0] as HTMLElement).style.position).toBe("absolute");
    });

    it("is ignored unless the caller opts in, so the editor renders it in place", () => {
        const host = document.createElement("div");
        draw(host, doc, { pinned: false });
        const nav = host.children[0] as HTMLElement;
        expect(nav.style.position).toBe("absolute");
        expect(nav.style.marginTop).toBe("");
    });

    it("returns a sticky layer to absolute when the section is unpinned", () => {
        const host = document.createElement("div");
        const cache = createSectionStackCache();
        draw(host, doc, { cache });
        const nav = cache.entries.get("nav")!.layer!;
        expect(nav.style.position).toBe("sticky");
        paintSectionStack(
            host,
            sections().map((s) => (s.id === "nav" ? { ...s, pinned: false } : s)),
            doc,
            tokens,
            { fullW: 1000, pinned: true, cache },
        );
        expect(cache.entries.get("nav")!.layer!.style.position).toBe("absolute");
        expect(cache.entries.get("nav")!.layer!.style.marginTop).toBe("");
        expect(cache.entries.get("nav")!.layer!.style.zIndex).toBe("");
    });
});

// The richer paint model (engine-gaps item 8): full CSS fidelity in the DOM backend.
describe("richer paint", () => {
    const one = (c: RenderCommand): HTMLElement => {
        const host = document.createElement("div");
        return paint([c], host)[0]!;
    };
    const box = { x: 0, y: 0, w: 100, h: 80 };

    it("paints multi-stop and radial gradients", () => {
        const linear = one({
            kind: "rect",
            box,
            fill: {
                gradient: {
                    from: "#000",
                    to: "#fff",
                    stops: [
                        { at: 0, color: "#111" },
                        { at: 0.4, color: "#555" },
                        { at: 1, color: "#eee" },
                    ],
                },
            },
        });
        expect(linear.style.background).toContain("#555 40%");
        const radial = one({
            kind: "rect",
            box,
            fill: { gradient: { from: "#000", to: "#fff", kind: "radial" } },
        });
        expect(radial.style.background).toContain("radial-gradient");
    });

    it("paints per-corner radius and side-selective borders", () => {
        const el = one({
            kind: "rect",
            box,
            fill: {
                color: "#eee",
                radius: [8, 8, 0, 0],
                border: { color: "#123", width: 3, sides: ["left"] },
            },
        });
        expect(el.style.borderRadius).toBe("8px 8px 0px 0px");
        expect(el.style.borderLeft).toContain("3px");
        expect(el.style.borderTop).toBe("");
    });

    it("paints a structured shadow and backdrop blur, and keeps legacy string shadows", () => {
        const el = one({
            kind: "rect",
            box,
            fill: {
                color: "#fff",
                shadow: { blur: 24, dy: 8, color: "rgba(0,0,0,0.2)" },
                backdropBlur: 14,
            },
        });
        expect(el.style.boxShadow).toBe("0px 8px 24px 0px rgba(0,0,0,0.2)");
        expect(el.style.backdropFilter).toBe("blur(14px)");
        const legacy = one({ kind: "rect", box, fill: { color: "#fff", shadow: "0 1px 2px red" } });
        expect(legacy.style.boxShadow).toBe("0 1px 2px red");
    });

    it("crops to an ellipse when the clip carries the shape", () => {
        const el = one({
            kind: "rect",
            box,
            fill: { color: "#eee" },
            clip: { x: 0, y: 0, w: 100, h: 80 },
            clipShape: "ellipse",
        });
        expect(el.style.clipPath).toBe("ellipse(50px 40px at 50px 40px)");
    });
});

describe("windowed repaints reconcile the child list minimally", () => {
    const secs = (n: number): Section[] =>
        Array.from({ length: n }, (_, i) =>
            sectionOf(inst("text", { text: `s${i}` }), { id: `w${i}` }),
        );
    const spyOps = (host: HTMLElement): { removed: string[]; inserted: string[] } => {
        const log = { removed: [] as string[], inserted: [] as string[] };
        const rc = host.removeChild.bind(host);
        const ib = host.insertBefore.bind(host);
        host.removeChild = ((n: Node) => {
            log.removed.push((n as HTMLElement).dataset?.probe ?? "?");
            return rc(n);
        }) as typeof host.removeChild;
        host.insertBefore = ((n: Node, ref: Node | null) => {
            log.inserted.push((n as HTMLElement).dataset?.probe ?? "?");
            return ib(n, ref);
        }) as typeof host.insertBefore;
        host.replaceChildren = () => {
            throw new Error("full replaceChildren on a windowed repaint");
        };
        return log;
    };

    it("an unchanged set touches nothing; one new section inserts one node", () => {
        const host = document.createElement("div");
        const cache = createSectionStackCache();
        const profile = resolveProfile("web");
        const win = { top: 0, bottom: 600 };
        paintSectionStack(host, secs(6), profile, tokens, { fullW: 1000, cache, window: win });
        for (const [i, el] of [...host.children].entries())
            (el as HTMLElement).dataset.probe = `n${i}`;
        const log = spyOps(host);
        paintSectionStack(host, secs(6), profile, tokens, { fullW: 1000, cache, window: win });
        expect(log.removed).toEqual([]);
        expect(log.inserted).toEqual([]);
        paintSectionStack(host, secs(6), profile, tokens, {
            fullW: 1000,
            cache,
            window: { top: 0, bottom: 5000 },
        });
        // whatever newly materialized was inserted; the probed originals were never detached
        expect(log.removed).toEqual([]);
        expect(log.inserted.every((p) => p === "?")).toBe(true);
    });
});
