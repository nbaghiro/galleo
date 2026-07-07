import type { ElementSpec, LayoutCtx } from "@elements/spec";
import type { EngineNode } from "@engine/node";
import { register, dot } from "@elements/spec";
import { fixed, grow } from "@model/geometry";

// `avatar` — a circular photo, the building block inside `profile`/`testimonial`. Registered but
// palette-hidden (see Panel's HIDDEN set); not a standalone palette item. Plain image leaf, no engine
// change. (An `icon` element already exists elsewhere, so composites use an emoji instead.)

interface AvatarData {
    src?: string;
    size?: number;
    ring?: boolean;
}

const AVATAR_DEFAULT = "https://i.pravatar.cc/240?img=12";

export const avatarElement: ElementSpec<AvatarData> = {
    type: "avatar",
    label: "Avatar",
    category: "media",
    tier: "primitive",
    create: () => ({ src: AVATAR_DEFAULT, size: 72 }),
    layout: (d: AvatarData, ctx: LayoutCtx): EngineNode => {
        const size = d.size ?? 72;
        const img: EngineNode = {
            w: grow(),
            h: grow(),
            image: { src: d.src || AVATAR_DEFAULT, fit: "cover", radius: size },
        };
        if (!d.ring) return { w: fixed(size), h: fixed(size), children: [img] };
        return {
            w: fixed(size),
            h: fixed(size),
            padding: { top: 3, right: 3, bottom: 3, left: 3 },
            fill: {
                color: "transparent",
                radius: size / 2,
                border: { color: ctx.theme.accent, width: 2 },
            },
            children: [img],
        };
    },
    resize: { width: false, height: { key: "size", min: 40, max: 240, step: 4 } },
    skeleton: (): EngineNode => dot(72),
    controls: [
        { key: "src", label: "Photo", control: "media" },
        { key: "size", label: "Size", control: "slider", min: 40, max: 240, step: 4, unit: "px" },
        { key: "ring", label: "Accent ring", control: "toggle", group: "Appearance" },
    ],
};

register(avatarElement);
