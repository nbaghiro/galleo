import { afterEach } from "vitest";
import { cleanup } from "./render";

// Unmount every rendered component after each test (dispose reactive scopes + remove DOM).
afterEach(() => {
    cleanup();
});
