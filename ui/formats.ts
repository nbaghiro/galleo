// Data only (no JSX), so headless consumers like the command registry can import it.
export const FORMATS: { value: string; label: string }[] = [
    { value: "deck", label: "Deck" },
    { value: "doc", label: "Doc" },
    { value: "web", label: "Site" },
];
