// Router navigation as a plain function, for modules that run outside a component (command handlers,
// palette sources). Injected once by App.tsx, since useNavigate() must run under the Router.
let nav: ((path: string) => void) | null = null;

export function setNavigate(fn: (path: string) => void): void {
    nav = fn;
}

export const go = (path: string): void => nav?.(path);
