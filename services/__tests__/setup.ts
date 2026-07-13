import { beforeEach } from "vitest";
import { resetDb } from "./harness";

beforeEach(async () => {
    await resetDb();
});
