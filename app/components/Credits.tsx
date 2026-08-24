import type { Component } from "solid-js";
import { Icon } from "@ui/icons";

// one way to write a price — coin, amount, the word — wherever credits appear
export const Credits: Component<{ n: number | string; suffix?: string }> = (props) => {
    const one = (): boolean => props.n === 1 || props.n === "1";
    return (
        <span class="inline-flex icon-row gap-1 whitespace-nowrap align-middle">
            <Icon name="credit" size={12} />
            <span class="tabular-nums">
                {props.n} credit{one() ? "" : "s"}
                {props.suffix ? ` ${props.suffix}` : ""}
            </span>
        </span>
    );
};
