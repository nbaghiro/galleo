// Single source of truth for the artifact format (deck/doc/web) + its label — shared by the editor topbar,
// the command palette, and the generate/create modals so the labels never drift. Data only (no JSX) so
// headless consumers (e.g. the command registry) can import it without pulling in a component.
export const FORMATS: { value: string; label: string }[] = [
    { value: "deck", label: "Deck" },
    { value: "doc", label: "Doc" },
    { value: "web", label: "Website" },
];
