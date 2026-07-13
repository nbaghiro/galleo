import type { JSX } from "solid-js";
import { render as solidRender } from "solid-js/web";

// A tiny Solid render helper for the component project (in lieu of @solidjs/testing-library, which isn't a
// dep). Mounts a component into a fresh happy-dom container and tracks it for teardown. `cleanup()` (wired
// into an afterEach by ui/test/setup.ts) disposes every mount so tests don't leak DOM/reactive scopes.

const mounted: (() => void)[] = [];

export interface Rendered {
    container: HTMLElement;
    unmount: () => void;
}

export function renderComponent(code: () => JSX.Element): Rendered {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const dispose = solidRender(code, container);
    const unmount = (): void => {
        dispose();
        container.remove();
    };
    mounted.push(unmount);
    return { container, unmount };
}

export function cleanup(): void {
    while (mounted.length) mounted.pop()?.();
}
