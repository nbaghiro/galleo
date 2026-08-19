import type { Component, JSX } from "solid-js";
import { Show, splitProps } from "solid-js";

// A person, at three sizes. The initial is the fallback rather than a generic glyph, so a row of
// members reads as distinct people even before any of them has uploaded a picture.

type AvatarSize = "sm" | "md" | "lg";
const SIZE: Record<AvatarSize, string> = {
    sm: "size-6 text-[10px]",
    md: "size-8 text-[12.5px]",
    lg: "size-11 text-[15px]",
};

type AvatarTone = "solid" | "soft";
const TONE: Record<AvatarTone, string> = {
    solid: "bg-accent text-onaccent",
    soft: "bg-accent/15 text-accent",
};

export const Avatar: Component<
    JSX.HTMLAttributes<HTMLSpanElement> & {
        src?: string | null;
        name?: string | null;
        email?: string | null;
        size?: AvatarSize;
        tone?: AvatarTone;
        rounded?: "lg" | "full";
    }
> = (props) => {
    const [local, rest] = splitProps(props, [
        "src",
        "name",
        "email",
        "size",
        "tone",
        "rounded",
        "class",
    ]);
    const initial = (): string =>
        (local.name?.trim()[0] ?? local.email?.trim()[0] ?? "?").toUpperCase();
    return (
        <span
            {...rest}
            class={[
                "flex flex-none items-center justify-center overflow-hidden font-bold",
                local.rounded === "lg" ? "rounded-lg" : "rounded-full",
                SIZE[local.size ?? "md"],
                TONE[local.tone ?? "soft"],
                local.class ?? "",
            ].join(" ")}
        >
            <Show when={local.src} fallback={initial()}>
                {(url) => <img src={url()} alt="" class="size-full object-cover" />}
            </Show>
        </span>
    );
};
