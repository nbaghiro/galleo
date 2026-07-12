import type { ElementSpec, LayoutCtx } from "@elements/spec";
import type { EngineNode } from "@engine/node";
import { register } from "@elements/spec";
import { fit, grow } from "@model/geometry";
import { fontStack } from "@themes";

interface CodeData {
    code: string;
}

export const codeElement: ElementSpec<CodeData> = {
    type: "code",
    label: "Code",
    category: "text",
    tier: "smart",
    create: () => ({ code: "const galleo = createEditor();\ngalleo.render(artifact);" }),
    layout: (d: CodeData, ctx: LayoutCtx): EngineNode => ({
        w: grow(),
        h: fit(),
        direction: "col",
        gap: 2,
        padding: { top: 16, bottom: 16, left: 18, right: 18 },
        fill: {
            color: ctx.theme.bg,
            radius: Math.round(ctx.theme.radius / 2),
            border: { color: ctx.theme.line, width: 1 },
        },
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
    }),
    controls: [
        { key: "code", label: "Code", control: "text", multiline: true, placeholder: "// code" },
    ],
};

register(codeElement);
