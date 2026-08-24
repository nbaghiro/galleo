// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import {
    dismissalFor,
    classifySwipe,
    newOwnerToken,
    OWNER_ATTR,
    pressInside,
    pressOnContent,
    SWIPE_MAX_MS,
    SWIPE_MIN_PX,
    TAP_BACK_FRACTION,
    tapZone,
} from "@ui/gesture";

describe("classifySwipe", () => {
    it("reads a leftward flick as next and a rightward flick as prev", () => {
        expect(classifySwipe({ dx: -80, dy: 4, dt: 180 })).toBe("next");
        expect(classifySwipe({ dx: 80, dy: 4, dt: 180 })).toBe("prev");
    });

    it("ignores movement below the jitter threshold", () => {
        expect(classifySwipe({ dx: -(SWIPE_MIN_PX - 1), dy: 0, dt: 120 })).toBeNull();
        expect(classifySwipe({ dx: -SWIPE_MIN_PX, dy: 0, dt: 120 })).toBe("next");
    });

    it("yields to the scroller when the gesture is mostly vertical", () => {
        expect(classifySwipe({ dx: -60, dy: 200, dt: 200 })).toBeNull();
        expect(classifySwipe({ dx: -60, dy: 40, dt: 200 })).toBe("next");
    });

    it("ignores a slow drag", () => {
        expect(classifySwipe({ dx: -120, dy: 0, dt: SWIPE_MAX_MS + 1 })).toBeNull();
        expect(classifySwipe({ dx: -120, dy: 0, dt: SWIPE_MAX_MS })).toBe("next");
    });

    it("treats a diagonal at the axis ratio boundary as vertical", () => {
        expect(classifySwipe({ dx: -100, dy: 100, dt: 200 })).toBeNull();
    });
});

describe("tapZone", () => {
    it("sends the leading edge back and everything else forward", () => {
        expect(tapZone(10, 400)).toBe("prev");
        expect(tapZone(200, 400)).toBe("next");
        expect(tapZone(399, 400)).toBe("next");
    });

    it("switches exactly at the back fraction", () => {
        const w = 1000;
        expect(tapZone(w * TAP_BACK_FRACTION - 1, w)).toBe("prev");
        expect(tapZone(w * TAP_BACK_FRACTION, w)).toBe("next");
    });

    it("defaults to next when the width is unknown", () => {
        expect(tapZone(0, 0)).toBe("next");
    });
});

// What a pointerdown means for a surface that is already open. The press is never swallowed, so
// this only decides whether the surface closes, not whether the click happens.
describe("dismissalFor", () => {
    const press = (over: Partial<{ inside: boolean; onCanvas: boolean }> = {}) => ({
        inside: false,
        onCanvas: false,
        ...over,
    });
    const rules = (over: Partial<{ dragging: boolean; deferOnCanvas: boolean }> = {}) => ({
        dragging: false,
        deferOnCanvas: false,
        ...over,
    });

    it("closes on a press with nothing to do with the surface", () => {
        expect(dismissalFor(press(), rules())).toBe("close");
    });

    it("leaves the surface alone when the press was inside it or on what opened it", () => {
        expect(dismissalFor(press({ inside: true }), rules())).toBe("keep");
        expect(dismissalFor(press({ inside: true, onCanvas: true }), rules())).toBe("keep");
    });

    // a palette tile drag starts inside the flyout and ends on the canvas: closing mid-gesture, or
    // on the release that drops it, would break the drop before it resolves
    it("never closes while a gesture owns the pointer", () => {
        expect(dismissalFor(press(), rules({ dragging: true }))).toBe("keep");
        expect(dismissalFor(press({ onCanvas: true }), rules({ dragging: true }))).toBe("keep");
    });

    it("defers a canvas press for a surface a selection can re-open", () => {
        expect(dismissalFor(press({ onCanvas: true }), rules({ deferOnCanvas: true }))).toBe(
            "defer",
        );
    });

    it("closes on a canvas press for a surface no selection would bring back", () => {
        expect(dismissalFor(press({ onCanvas: true }), rules())).toBe("close");
    });

    it("closes on chrome even when canvas presses are deferred", () => {
        expect(dismissalFor(press(), rules({ deferOnCanvas: true }))).toBe("close");
    });
});

// The containment half of the same decision. A popover portals to <body>, so the surface that owns
// it cannot contain it: what makes a press on a menu item a press inside the panel that opened it
// is the token stamped on what was portaled, not the DOM.
describe("pressInside", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    // a press lands on the deepest node; composedPath carries it and every ancestor
    const pathTo = (el: Element): EventTarget[] => {
        const path: EventTarget[] = [];
        for (let n: Element | null = el; n; n = n.parentElement) path.push(n);
        return [...path, document, window];
    };

    const mount = (html: string): HTMLElement => {
        document.body.innerHTML = html;
        return document.body.firstElementChild as HTMLElement;
    };

    it("reads a press on the surface itself as inside", () => {
        const panel = mount(`<div id="panel"><button id="hit">x</button></div>`);
        const hit = document.getElementById("hit")!;
        expect(pressInside(pathTo(hit), { el: panel })).toBe(true);
    });

    it("reads a press on a portaled node the surface owns as inside", () => {
        const panel = mount(`<div id="panel"></div>`);
        document.body.insertAdjacentHTML(
            "beforeend",
            `<div ${OWNER_ATTR}="thread-1"><button id="item">Delete</button></div>`,
        );
        const item = document.getElementById("item")!;
        // the point of the whole mechanism: not a descendant, still inside
        expect(panel.contains(item)).toBe(false);
        expect(pressInside(pathTo(item), { el: panel, owner: "thread-1" })).toBe(true);
    });

    it("inherits through a nested portal, so a menu inside a dropdown still answers", () => {
        mount(
            `<div ${OWNER_ATTR}="flyout-1"><div ${OWNER_ATTR}="flyout-1"><button id="deep">x</button></div></div>`,
        );
        const deep = document.getElementById("deep")!;
        expect(pressInside(pathTo(deep), { owner: "flyout-1" })).toBe(true);
    });

    it("reads a press on the control that opened it as inside", () => {
        mount(`<button data-galleo-thread="t1">marker</button>`);
        const marker = document.body.firstElementChild!;
        expect(pressInside(pathTo(marker), { opener: '[data-galleo-thread="t1"]' })).toBe(true);
    });

    it("keeps another surface's popover outside, so a different thread still closes this one", () => {
        const panel = mount(`<div id="panel"></div>`);
        document.body.insertAdjacentHTML(
            "beforeend",
            `<div ${OWNER_ATTR}="thread-2"><button id="other">x</button></div>`,
        );
        const other = document.getElementById("other")!;
        expect(
            pressInside(pathTo(other), {
                el: panel,
                owner: "thread-1",
                opener: '[data-galleo-thread="t1"]',
            }),
        ).toBe(false);
    });

    it("reads a press with nothing to do with the surface as outside", () => {
        const panel = mount(`<div id="panel"></div>`);
        document.body.insertAdjacentHTML("beforeend", `<main><span id="canvas">x</span></main>`);
        const canvas = document.getElementById("canvas")!;
        expect(pressInside(pathTo(canvas), { el: panel, owner: "thread-1" })).toBe(false);
    });

    it("walks a path carrying the document and the window without tripping", () => {
        expect(pressInside([document, window], { owner: "thread-1" })).toBe(false);
    });
});

describe("newOwnerToken", () => {
    it("never repeats, so two panels of the same kind own their own popovers", () => {
        const a = newOwnerToken("thread");
        const b = newOwnerToken("thread");
        expect(a).not.toBe(b);
        expect(a.startsWith("thread")).toBe(true);
    });
});

describe("pressOnContent", () => {
    const mounted = (html: string): HTMLElement => {
        document.body.innerHTML = html;
        return document.body.firstElementChild as HTMLElement;
    };

    it("stands the surface down for a press on a link, or anything inside one", () => {
        const a = mounted(`<a href="https://galleo.app"><span id="label">Get started</span></a>`);
        expect(pressOnContent(a)).toBe(true);
        expect(pressOnContent(document.getElementById("label"))).toBe(true);
    });

    it("stands down for a live player, so a play click never advances the slide", () => {
        const wrap = mounted(`<div data-live="video"><video id="v"></video></div>`);
        expect(pressOnContent(wrap)).toBe(true);
        expect(pressOnContent(document.getElementById("v"))).toBe(true);
    });

    it("lets an ordinary press through, and survives a non-element target", () => {
        expect(pressOnContent(mounted(`<div><p id="p">text</p></div>`))).toBe(false);
        expect(pressOnContent(null)).toBe(false);
        expect(pressOnContent(window)).toBe(false);
    });
});
