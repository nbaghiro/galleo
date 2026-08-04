// ElementInstance.data is `unknown` by design, so anything reading it has to narrow first.
// These keep a wrong-typed field from reaching a parser that assumed its declared type.

export const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

export const bool = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : undefined);

export const num = (v: unknown): number | undefined =>
    typeof v === "number" && Number.isFinite(v) ? v : undefined;

export const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined =>
    allowed.find((a) => a === v);
