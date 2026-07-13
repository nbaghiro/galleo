// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { focusables, trapFocus } from "../focus";

function mount(html: string): HTMLElement {
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.appendChild(host);
    return host;
}

describe("focusables", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });
    it("collects tab-order controls and skips disabled + tabindex=-1", () => {
        const host = mount(`
            <button id="a">a</button>
            <button id="b" disabled>b</button>
            <input id="c" />
            <div id="d" tabindex="-1">d</div>
            <a id="e" href="#">e</a>
        `);
        expect(focusables(host).map((el) => el.id)).toEqual(["a", "c", "e"]);
    });
});

describe("trapFocus", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("focuses the first control, then an autofocus target when present", () => {
        const plain = mount(`<button id="x">x</button><button id="y">y</button>`);
        const dispose1 = trapFocus(plain);
        expect(document.activeElement?.id).toBe("x");
        dispose1();

        const withAuto = mount(`<button id="p">p</button><input id="q" autofocus />`);
        const dispose2 = trapFocus(withAuto);
        expect(document.activeElement?.id).toBe("q");
        dispose2();
    });

    it("wraps Tab / Shift+Tab at the ends", () => {
        const host = mount(
            `<button id="first">1</button><button id="mid">2</button><button id="last">3</button>`,
        );
        const dispose = trapFocus(host);
        const last = host.querySelector<HTMLElement>("#last")!;
        const first = host.querySelector<HTMLElement>("#first")!;

        last.focus();
        last.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }),
        );
        expect(document.activeElement?.id).toBe("first");

        first.dispatchEvent(
            new KeyboardEvent("keydown", {
                key: "Tab",
                shiftKey: true,
                bubbles: true,
                cancelable: true,
            }),
        );
        expect(document.activeElement?.id).toBe("last");
        dispose();
    });

    it("restores focus to the previously-focused element on dispose", () => {
        const outside = mount(`<button id="outside">o</button>`);
        const trigger = outside.querySelector<HTMLElement>("#outside")!;
        trigger.focus();
        const modal = mount(`<button id="inside">i</button>`);
        const dispose = trapFocus(modal);
        expect(document.activeElement?.id).toBe("inside");
        dispose();
        expect(document.activeElement?.id).toBe("outside");
    });
});
