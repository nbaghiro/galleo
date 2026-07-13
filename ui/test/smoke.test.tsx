import { describe, expect, it } from "vitest";
import { createSignal } from "solid-js";
import { renderComponent } from "./render";

// Proves the component project itself: JSX compiles, solid-js resolves to its client build, happy-dom
// mounts, and reactivity works. Real component tests build on this harness.

describe("component project smoke", () => {
    it("renders JSX into the DOM", () => {
        const { container } = renderComponent(() => <div class="greet">hello</div>);
        expect(container.querySelector(".greet")?.textContent).toBe("hello");
    });

    it("reacts to a signal update", () => {
        const [n, setN] = createSignal(0);
        const { container } = renderComponent(() => <span>{n()}</span>);
        expect(container.querySelector("span")?.textContent).toBe("0");
        setN(5);
        expect(container.querySelector("span")?.textContent).toBe("5");
    });
});
