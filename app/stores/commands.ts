import { registerCommands } from "@ui/keys";
import { openGenerate } from "./generate";
import { openThemeEditor } from "./theme";
import { modelDebugAvailable, openModelDebug } from "../components/ModelDebug";
import { toggleChat } from "./chat";
import { logout } from "./auth";
import { go } from "./navigate";

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
        slash: "/generate",
        run: () => openGenerate(),
    },
    {
        id: "debug.models",
        title: "Models: pick one per step",
        group: "file",
        icon: "sparkle",
        keywords: ["model", "debug", "gpt", "claude", "gemini", "override"],
        slash: "/models",
        when: () => modelDebugAvailable(),
        run: () => openModelDebug(),
    },
    {
        id: "theme.open",
        title: "Change theme…",
        group: "theme",
        icon: "theme",
        keywords: ["appearance", "color"],
        slash: "/theme",
        run: () => openThemeEditor(),
    },
    {
        id: "ai.chat.toggle",
        title: "Toggle AI chat",
        group: "ai",
        icon: "agent",
        keywords: ["assistant"],
        slash: "/chat",
        run: () => toggleChat(),
    },
    {
        id: "account.upgrade",
        title: "Plans & pricing",
        group: "account",
        icon: "arrowUpRight",
        keywords: ["billing", "upgrade"],
        slash: "/pricing",
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
