// Overlay stacking order; the `z-*` utilities in ui/styles.css must match these.
export const Z = {
    raised: 10, // sticky headers, minor raised bits
    panel: 20, // docked canvas panels, selection box, in-place generation overlay
    menu: 30, // topbar, inline canvas menus/popups
    chrome: 40, // floating editor chrome — the context bar + the right toolbar rail
    overlay: 50, // flyouts spawned from chrome — mark bar, AI menu, insert drag ghost
    drawer: 60, // the chat drawer
    present: 65, // fullscreen present / preview takeover
    modal: 70, // modals — theme / generate / share / media / data editor
    popover: 80, // dropdown menus / selects / color popovers (above modals)
} as const;
