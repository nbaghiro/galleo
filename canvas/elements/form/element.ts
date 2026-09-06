import type { ControlField, ElementSpec, LayoutCtx } from "@elements/spec";
import type { EngineNode } from "@engine/node";
import type { ElementInstance } from "@model/artifact";
import { register } from "@elements/spec";
import { inputRegionId } from "@model/artifact";
import { FORM_FIELDS, type FormFieldKind } from "@model/elements";
import { fit, fixed, grow } from "@model/geometry";
import { fontStack } from "@themes";
import { str } from "@elements/coerce";

// The form family: `field` paints one input's resting look, a form is an open container of fields
// that paints its own submit button. Nothing here is interactive; the engine emits the interactive
// block's geometry as an `input:` region and the live overlay (ui/live.tsx) mounts the real
// control over it on publish. Editor, Present and every export show exactly this paint.

export interface FieldData {
    kind: FormFieldKind;
    label: string;
    placeholder?: string;
    required?: boolean;
    options?: string; // select/choice, one per line or comma-separated (the diagram items rule)
}

export interface FormData {
    children: ElementInstance[];
    submitLabel: string;
    success: string;
}

export const splitOptions = (s: string | undefined): string[] =>
    ((s ?? "").includes("\n") ? (s ?? "").split("\n") : (s ?? "").split(","))
        .map((x) => x.trim())
        .filter(Boolean);

const KIND_LABEL: Record<FormFieldKind, string> = {
    text: "Text field",
    email: "Email field",
    phone: "Phone field",
    textarea: "Text area",
    select: "Dropdown",
    checkbox: "Checkbox",
    choice: "Choice",
};

export const BOX_H = 42;
const AREA_H = 96;
const LABEL_SIZE = 13;
const INPUT_SIZE = 14;

const boxRadius = (theme: LayoutCtx["theme"]): number =>
    Math.max(4, Math.min(10, Math.round(theme.radius)));

const labelLeaf = (d: FieldData, ctx: LayoutCtx): EngineNode => ({
    w: grow(),
    h: fit(),
    ...(ctx.region ? { id: `label:${ctx.region}` } : {}),
    text: {
        text: d.required ? `${d.label} *` : d.label,
        fontId: fontStack("ui", ctx.theme),
        size: LABEL_SIZE,
        weight: 600,
        color: ctx.theme.ink,
        wrap: "words",
    },
});

const ghostText = (text: string, ctx: LayoutCtx): EngineNode => ({
    w: grow(),
    h: fit(),
    text: {
        text,
        fontId: fontStack("ui", ctx.theme),
        size: INPUT_SIZE,
        color: ctx.theme.muted,
        wrap: "none",
    },
});

// the resting input box; the live overlay replaces exactly this rectangle with a real control
const inputBox = (d: FieldData, ctx: LayoutCtx): EngineNode => {
    const base: EngineNode = {
        id: ctx.region ? inputRegionId(ctx.region) : undefined,
        w: grow(),
        h: fixed(d.kind === "textarea" ? AREA_H : BOX_H),
        direction: "row",
        alignY: d.kind === "textarea" ? "start" : "center",
        padding: { top: 10, right: 12, bottom: 10, left: 12 },
        fill: {
            color: ctx.theme.surface,
            radius: boxRadius(ctx.theme),
            border: { color: ctx.theme.line, width: 1 },
        },
        children: [ghostText(d.placeholder ?? "", ctx)],
    };
    if (d.kind === "select")
        base.children = [
            ghostText(d.placeholder ?? splitOptions(d.options)[0] ?? "", ctx),
            { w: fit(), h: fit(), text: { ...ghostText("▾", ctx).text!, wrap: "none" } },
        ];
    return base;
};

const mark = (ctx: LayoutCtx, round: boolean): EngineNode => ({
    w: fixed(18),
    h: fixed(18),
    fill: {
        color: ctx.theme.surface,
        radius: round ? 9 : 4,
        border: { color: ctx.theme.line, width: 1 },
    },
});

const optionRow = (text: string, ctx: LayoutCtx, round: boolean, labelId?: string): EngineNode => ({
    w: grow(),
    h: fit(),
    direction: "row",
    gap: 10,
    alignY: "center",
    children: [
        mark(ctx, round),
        {
            w: grow(),
            h: fit(),
            ...(labelId ? { id: labelId } : {}),
            text: {
                text,
                fontId: fontStack("ui", ctx.theme),
                size: INPUT_SIZE,
                color: ctx.theme.ink,
                wrap: "words",
            },
        },
    ],
});

function fieldNode(d: FieldData, ctx: LayoutCtx): EngineNode {
    const id = ctx.region ? inputRegionId(ctx.region) : undefined;
    if (d.kind === "checkbox")
        return {
            id,
            w: grow(),
            h: fit(),
            children: [
                optionRow(
                    d.required ? `${d.label} *` : d.label,
                    ctx,
                    false,
                    ctx.region ? `label:${ctx.region}` : undefined,
                ),
            ],
        };
    if (d.kind === "choice")
        return {
            w: grow(),
            h: fit(),
            direction: "col",
            gap: 8,
            children: [
                labelLeaf(d, ctx),
                {
                    id,
                    w: grow(),
                    h: fit(),
                    direction: "col",
                    gap: 8,
                    children: splitOptions(d.options).map((o) => optionRow(o, ctx, true)),
                },
            ],
        };
    return {
        w: grow(),
        h: fit(),
        direction: "col",
        gap: 6,
        children: [...(d.label ? [labelLeaf(d, ctx)] : []), inputBox(d, ctx)],
    };
}

const FIELD_CONTROLS: ControlField[] = [
    {
        key: "kind",
        label: "Kind",
        control: "select",
        options: FORM_FIELDS.map((k) => ({ label: KIND_LABEL[k], value: k })),
    },
    {
        key: "placeholder",
        label: "Placeholder",
        control: "text",
        visibleWhen: (d) => d.kind !== "checkbox" && d.kind !== "choice",
    },
    { key: "required", label: "Required", control: "toggle", icon: "required" },
    {
        key: "options",
        label: "Options",
        control: "text",
        multiline: true,
        placeholder: "One per line",
        visibleWhen: (d) => d.kind === "select" || d.kind === "choice",
    },
];

export const fieldElement: ElementSpec<FieldData> = {
    type: "field",
    label: "Field",
    category: "form",
    tier: "primitive",
    create: () => ({ kind: "text", label: "Name", placeholder: "Jane Doe" }),
    labelFor: (d) => KIND_LABEL[d.kind] ?? "Field",
    layout: (d, ctx) => fieldNode(coerceField(d), ctx),
    inlineText: "label",
    bar: ["kind", "required"],
    controls: FIELD_CONTROLS,
};

export function coerceField(raw: unknown): FieldData {
    const d = (raw ?? {}) as Record<string, unknown>;
    const kind = FORM_FIELDS.includes(d.kind as FormFieldKind) ? (d.kind as FormFieldKind) : "text";
    return {
        kind,
        label: str(d.label) ?? "",
        placeholder: str(d.placeholder),
        required: d.required === true,
        options: str(d.options),
    };
}

const submitNode = (label: string, ctx: LayoutCtx): EngineNode => ({
    w: grow(),
    h: fit(),
    direction: "row",
    children: [
        {
            id: ctx.region ? inputRegionId(ctx.region) : undefined,
            w: fit(),
            h: fixed(BOX_H),
            direction: "row",
            alignY: "center",
            padding: { top: 0, right: 20, bottom: 0, left: 20 },
            fill: { color: ctx.theme.accent, radius: boxRadius(ctx.theme) },
            children: [
                {
                    w: fit(),
                    h: fit(),
                    ...(ctx.region ? { id: `label:${ctx.region}` } : {}),
                    text: {
                        text: label,
                        fontId: fontStack("ui", ctx.theme),
                        size: INPUT_SIZE,
                        weight: 600,
                        color: ctx.theme.onAccent,
                        wrap: "none",
                    },
                },
            ],
        },
    ],
});

const coerceForm = (raw: unknown): FormData => {
    const d = (raw ?? {}) as Record<string, unknown>;
    return {
        children: Array.isArray(d.children) ? (d.children as ElementInstance[]) : [],
        submitLabel: str(d.submitLabel) ?? "Submit",
        success: str(d.success) ?? "Thanks, your response is in.",
    };
};

const arrangeForm = (raw: unknown, ctx: LayoutCtx, kids: EngineNode[]): EngineNode => {
    const d = coerceForm(raw);
    return {
        w: grow(),
        h: fit(),
        direction: "col",
        gap: 14,
        children: [...kids, submitNode(d.submitLabel || "Submit", ctx)],
    };
};

const f = (kind: FormFieldKind, label: string, extra?: Partial<FieldData>): ElementInstance => ({
    type: "field",
    data: { kind, label, ...extra },
});

function formSpec(
    type: string,
    label: string,
    submitLabel: string,
    success: string,
    fields: () => ElementInstance[],
): ElementSpec<FormData> {
    return {
        type,
        label,
        category: "form",
        tier: "interactive",
        create: () => ({ children: fields(), submitLabel, success }),
        layout: (d, ctx) => arrangeForm(d, ctx, []),
        container: {
            children: (d) => coerceForm(d).children,
            arrange: (d, ctx, kids) => arrangeForm(d, ctx, kids),
            withChildren: (d, children) => ({ ...coerceForm(d), children }),
        },
        inlineText: "submitLabel",
        controls: [
            { key: "success", label: "After submitting", control: "text", multiline: true },
            {
                key: "addField",
                label: "Add field",
                control: "action",
                run: (d) => {
                    const form = coerceForm(d);
                    return { ...form, children: [...form.children, f("text", "Field")] };
                },
            },
        ],
    };
}

export const FORM_TYPES = [
    "contactForm",
    "signupForm",
    "rsvpForm",
    "pollForm",
    "feedbackForm",
] as const;

const FORMS: Record<(typeof FORM_TYPES)[number], ElementSpec<FormData>> = {
    contactForm: formSpec(
        "contactForm",
        "Contact form",
        "Send message",
        "Thanks, we got your message.",
        () => [
            f("text", "Name", { placeholder: "Jane Doe", required: true }),
            f("email", "Email", { placeholder: "jane@example.com", required: true }),
            f("textarea", "Message", { placeholder: "What can we help with?", required: true }),
        ],
    ),
    signupForm: formSpec("signupForm", "Signup form", "Sign up", "You are on the list.", () => [
        f("email", "Email", { placeholder: "jane@example.com", required: true }),
    ]),
    rsvpForm: formSpec("rsvpForm", "RSVP form", "RSVP", "See you there.", () => [
        f("text", "Name", { placeholder: "Jane Doe", required: true }),
        f("choice", "Attending", { options: "Yes, No", required: true }),
    ]),
    pollForm: formSpec("pollForm", "Poll", "Vote", "Vote counted.", () => [
        f("choice", "Pick one", { options: "Option A, Option B, Option C", required: true }),
    ]),
    feedbackForm: formSpec(
        "feedbackForm",
        "Feedback form",
        "Send feedback",
        "Thank you for the feedback.",
        () => [
            f("choice", "How was it?", { options: "Great, Fine, Not for me", required: true }),
            f("textarea", "Tell us more", { placeholder: "Anything we should know?" }),
            f("email", "Email", { placeholder: "Optional, if you want a reply" }),
        ],
    ),
};

register(fieldElement);
for (const t of FORM_TYPES) register(FORMS[t]);
