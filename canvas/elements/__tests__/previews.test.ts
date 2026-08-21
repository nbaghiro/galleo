import "@elements/register";
import { describe, expect, it } from "vitest";
import { getElement } from "@elements/spec";
import { previewSvg } from "@elements/previews";

const blank = previewSvg("__no-such-element__");

const typeOptions = (element: string): { label: string; value: string; preview?: string }[] =>
    getElement(element)!.controls.find((c) => c.key === "type")!.options ?? [];

describe("type-switcher previews", () => {
    // The dropdown row art is the variant's own palette tile, found by the `<type>Chart` /
    // `<type>Diagram` naming the VARIANTS arrays use. A type that breaks the convention would fall
    // back to the blank placeholder instead of failing, so the convention is asserted here.
    for (const element of ["chart", "diagram"]) {
        it(`every ${element} type offers its own tile`, () => {
            const options = typeOptions(element);
            expect(options.length).toBeGreaterThan(0);
            const missing = options
                .filter((o) => !o.preview || o.preview === blank)
                .map((o) => o.value);
            expect(missing).toEqual([]);
        });
    }
});
