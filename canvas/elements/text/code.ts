import type { ElementSpec, LayoutCtx } from "@elements/spec";
import type { EngineNode } from "@engine/node";
import { register } from "@elements/spec";
import { fit, grow } from "@model/geometry";
import { fontStack } from "@themes";

interface CodeData {
    code: string;
}

// One leaf per line with no gap between them, so the in-place editor's line pitch (the leaf's
// line height) lands on the painted lines exactly; it edits the whole block as one field.

export const codeElement: ElementSpec<CodeData> = {
    type: "code",
    label: "Code",
    category: "text",
    tier: "unit",
    create: () => ({ code: "const galleo = createEditor();\ngalleo.render(artifact);" }),
    layout: (d: CodeData, ctx: LayoutCtx): EngineNode => ({
        w: grow(),
        h: fit(),
        padding: { top: 16, bottom: 16, left: 18, right: 18 },
        fill: {
            color: ctx.theme.bg,
            radius: Math.round(ctx.theme.radius / 2),
            border: { color: ctx.theme.line, width: 1 },
        },
        children: [
            {
                w: grow(),
                h: fit(),
                direction: "col",
                ...(ctx.region ? { id: `label:${ctx.region}` } : {}),
                children: d.code.split("\n").map(
                    (line): EngineNode => ({
                        w: grow(),
                        h: fit(),
                        text: {
                            text: line.length ? line : " ",
                            fontId: fontStack("mono", ctx.theme),
                            size: 13.5,
                            color: ctx.theme.ink,
                            align: "start",
                            wrap: "words",
                        },
                    }),
                ),
            },
        ],
    }),
    inlineText: { key: "code", multiline: true },
    controls: [],
    frame: true,
};

register(codeElement);
