import type { Id } from "@model/content";

export type FormatKind = "paged" | "continuous";

export interface FormatDescriptor {
    id: Id;
    name: string;
    kind: FormatKind;
    width: number | "fill";
    height: number | "auto";
    maxContentWidth?: number;
    tokenScale: number;
    splitMinWidth: number;
    paginate: "always" | "export" | "never";
}
