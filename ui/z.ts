// The single source of truth for overlay stacking order. Two consumers, kept in lockstep:
//   • Tailwind class usages reference the matching `z-*` utilities defined in ui/styles.css (@utility).
//   • Inline-style usages (a component's `z` prop default) reference these constants.
// Ascending, each a distinct layer so modules name their intent instead of picking a magic number:
//   chrome (context bar / rail) < overlay (flyouts spawned from chrome) < drawer (chat) <
//   present (fullscreen) < modal (dialogs) < popover (dropdowns — must sit above a modal so an
//   in-modal menu is usable).
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
