import { registerCommands } from "@ui/keys";
import { openGenerate } from "./generate";
import { openThemeEditor } from "./theme";
import { toggleChat } from "./chat";
import { logout } from "./auth";

// injected by App.tsx (useNavigate must run in a component)
let nav: ((path: string) => void) | null = null;
export function setNavigate(fn: (path: string) => void): void {
    nav = fn;
}
const go = (path: string): void => nav?.(path);

registerCommands([
    {
        id: "nav.library",
        title: "Go to library",
        group: "navigate",
        icon: "library",
        keywords: ["home", "artifacts"],
        run: () => go("/"),
    },
    {
        id: "nav.templates",
        title: "Browse templates",
        group: "navigate",
        icon: "templates",
        run: () => go("/templates"),
    },
    {
        id: "nav.shared",
        title: "Shared with me",
        group: "navigate",
        icon: "shared",
        run: () => go("/shared"),
    },
    {
        id: "nav.trash",
        title: "Open trash",
        group: "navigate",
        icon: "trash",
        keywords: ["deleted"],
        run: () => go("/trash"),
    },
    {
        id: "doc.newViaAi",
        title: "Generate with AI…",
        group: "file",
        icon: "sparkle",
        keywords: ["create", "new", "generate"],
        run: () => openGenerate(),
    },
    {
        id: "theme.open",
        title: "Change theme…",
        group: "theme",
        icon: "theme",
        keywords: ["appearance", "color"],
        run: () => openThemeEditor(),
    },
    {
        id: "ai.chat.toggle",
        title: "Toggle AI chat",
        group: "ai",
        icon: "agent",
        keywords: ["assistant"],
        run: () => toggleChat(),
    },
    {
        id: "account.upgrade",
        title: "Plans & pricing",
        group: "account",
        icon: "arrowUpRight",
        keywords: ["billing", "upgrade"],
        run: () => go("/pricing"),
    },
    {
        id: "account.signOut",
        title: "Sign out",
        group: "account",
        icon: "signOut",
        run: () => {
            void logout();
            go("/");
        },
    },
]);
