import { describe, expect, it } from "vitest";
import "@elements/register";
import type { RenderCommand } from "@engine/node";
import { inputRegionId, parseInputRegion } from "@model/artifact";
import { getElement } from "@elements/spec";
import { FORM_TYPES, splitOptions } from "@elements/form/element";
import { layoutSection } from "@canvas/render/commands";
import { inst, measure, sectionOf, tokens } from "@canvas/testkit";

const laid = (root: ReturnType<typeof inst>): { commands: RenderCommand[]; inputs: string[] } => {
    const { commands, regions } = layoutSection(
        sectionOf(root, { id: "s1" }),
        800,
        measure,
        tokens,
    );
    return {
        commands,
        inputs: regions.map((r) => r.id).filter((id) => parseInputRegion(id)),
    };
};

const texts = (commands: RenderCommand[]): string[] =>
    commands.filter((c) => c.kind === "text").map((c) => (c.kind === "text" ? c.text.text : ""));

describe("the field element", () => {
    it("paints label and placeholder, and mints one input region for the box", () => {
        const { commands, inputs } = laid(
            inst("field", { kind: "text", label: "Name", placeholder: "Jane Doe" }),
        );
        expect(texts(commands)).toEqual(expect.arrayContaining(["Name", "Jane Doe"]));
        expect(inputs).toEqual(["input:el:s1"]);
    });

    it("marks a required field on its label", () => {
        const { commands } = laid(inst("field", { kind: "email", label: "Email", required: true }));
        expect(texts(commands)).toContain("Email *");
    });

    it("a textarea is taller than a text box", () => {
        const short = laid(inst("field", { kind: "text", label: "A" }));
        const tall = laid(inst("field", { kind: "textarea", label: "A" }));
        const boxOf = (r: ReturnType<typeof laid>): number =>
            r.commands.find((c) => c.kind === "rect" && c.fill?.border)!.box.h;
        expect(boxOf(tall)).toBeGreaterThan(boxOf(short));
    });

    it("a choice paints one row per option, and the options block is the input region", () => {
        const { commands, inputs } = laid(
            inst("field", { kind: "choice", label: "Pick", options: "One, Two, Three" }),
        );
        expect(texts(commands)).toEqual(expect.arrayContaining(["One", "Two", "Three"]));
        expect(inputs).toEqual(["input:el:s1"]);
    });

    it("coerces junk data to a text field instead of failing", () => {
        const { commands } = laid(inst("field", { kind: "carrier-pigeon", label: 7 }));
        expect(commands.length).toBeGreaterThan(0);
    });
});

describe("the form element", () => {
    it("lays out its fields and mints input regions for each, plus its own submit", () => {
        const { commands, inputs } = laid(inst("contactForm", getElement("contactForm")!.create()));
        expect(inputs).toEqual(["input:el:s1:0", "input:el:s1:1", "input:el:s1:2", "input:el:s1"]);
        expect(texts(commands)).toContain("Send message");
    });

    it("is an open container: children read and write through the registry", () => {
        const spec = getElement("signupForm")!;
        const data = spec.create();
        const kids = spec.container!.children(data);
        expect(kids).toHaveLength(1);
        const grown = spec.container!.withChildren(data, [
            ...kids,
            { type: "field", data: { kind: "text", label: "Company" } },
        ]);
        expect(spec.container!.children(grown)).toHaveLength(2);
    });

    it("every variant's preset lays out with a submit button", () => {
        for (const t of FORM_TYPES) {
            const { commands, inputs } = laid(inst(t, getElement(t)!.create()));
            expect(commands.length, t).toBeGreaterThan(0);
            expect(inputs.length, t).toBeGreaterThan(1); // at least one field + the submit
        }
    });
});

describe("the input region grammar", () => {
    it("round-trips and rejects other prefixes", () => {
        expect(parseInputRegion(inputRegionId("el:s1:2"))).toBe("el:s1:2");
        expect(parseInputRegion("el:s1:2")).toBeNull();
        expect(parseInputRegion("datum:el:s1:2:0")).toBeNull();
    });
});

describe("splitOptions", () => {
    it("splits on newlines when present, else commas", () => {
        expect(splitOptions("A, B, C")).toEqual(["A", "B", "C"]);
        expect(splitOptions("A, with comma\nB")).toEqual(["A, with comma", "B"]);
        expect(splitOptions(undefined)).toEqual([]);
    });
});
