import type { ControlField } from "./element-spec";

// Declarative schema for the section property panel — the flat, scalar props (width + background). The
// grid-template picker is inherently visual (live thumbnails), so it stays a bespoke control in the
// studio; everything else renders generically through the shared Field kit, exactly like element
// controls. The studio adapts these flat keys to the structured Section (bleed + background) on
// read/write, and `visibleWhen` handles the background's conditional sub-fields.
export const SECTION_CONTROLS: ControlField[] = [
    {
        key: "bleed",
        label: "Width",
        control: "segmented",
        options: [
            { label: "Contained", value: "contained" },
            { label: "Full-bleed", value: "full" },
        ],
        group: "Width",
    },
    {
        key: "bgKind",
        label: "Background",
        control: "segmented",
        options: [
            { label: "None", value: "none" },
            { label: "Color", value: "color" },
            { label: "Gradient", value: "gradient" },
            { label: "Image", value: "image" },
        ],
        group: "Background",
    },
    {
        key: "bgColor",
        label: "Color",
        control: "color",
        group: "Background",
        visibleWhen: (d) => d.bgKind === "color",
    },
    {
        key: "bgFrom",
        label: "From",
        control: "color",
        group: "Background",
        visibleWhen: (d) => d.bgKind === "gradient",
    },
    {
        key: "bgTo",
        label: "To",
        control: "color",
        group: "Background",
        visibleWhen: (d) => d.bgKind === "gradient",
    },
    {
        key: "bgAngle",
        label: "Angle",
        control: "slider",
        min: 0,
        max: 360,
        step: 5,
        unit: "°",
        group: "Background",
        visibleWhen: (d) => d.bgKind === "gradient",
    },
    {
        key: "bgImage",
        label: "Image URL",
        control: "text",
        placeholder: "https://… image url",
        group: "Background",
        visibleWhen: (d) => d.bgKind === "image",
    },
    {
        key: "bgScrim",
        label: "Darken",
        control: "slider",
        min: 0,
        max: 0.8,
        step: 0.05,
        group: "Background",
        visibleWhen: (d) => d.bgKind === "image",
    },
];
