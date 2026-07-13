import { beforeEach } from "vitest";
import { resetDb } from "./harness";

// Full isolation: every integration test starts from an empty DB and seeds exactly what it needs.
beforeEach(async () => {
    await resetDb();
});
