import { PROFILES } from "@engine/profile";

// Data only (no JSX), so headless consumers like the command registry can import it. Derived from the
// profile registry, so a new format is one PROFILES entry rather than an edit here as well.
export const FORMATS: { value: string; label: string }[] = Object.values(PROFILES).map((p) => ({
    value: p.id,
    label: p.name,
}));
