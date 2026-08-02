import { afterEach, describe, expect, it, vi } from "vitest";
import { cachedExport, clearExportCache } from "../exportCache";

afterEach(() => clearExportCache());

describe("cachedExport", () => {
    it("builds once per (key, fingerprint) and shares the promise", async () => {
        const build = vi.fn(async () => "a");
        const p1 = cachedExport("pdf", "fp1", build);
        const p2 = cachedExport("pdf", "fp1", build);
        expect(p1).toBe(p2);
        expect(await p1).toBe("a");
        expect(build).toHaveBeenCalledTimes(1);
    });

    it("a new fingerprint rebuilds and disposes the stale value", async () => {
        const dispose = vi.fn();
        await cachedExport("pdf", "fp1", async () => "old", dispose);
        expect(await cachedExport("pdf", "fp2", async () => "new", dispose)).toBe("new");
        await Promise.resolve();
        expect(dispose).toHaveBeenCalledWith("old");
    });

    it("keys are independent", async () => {
        expect(await cachedExport("pdf", "fp1", async () => "pdf")).toBe("pdf");
        expect(await cachedExport("zip", "fp1", async () => "zip")).toBe("zip");
    });

    it("does not cache failures", async () => {
        const failing = cachedExport("pdf", "fp1", async () => {
            throw new Error("boom");
        });
        await expect(failing).rejects.toThrow("boom");
        expect(await cachedExport("pdf", "fp1", async () => "recovered")).toBe("recovered");
    });

    it("clearExportCache disposes everything", async () => {
        const dispose = vi.fn();
        await cachedExport("pdf", "fp1", async () => "v", dispose);
        clearExportCache();
        await Promise.resolve();
        expect(dispose).toHaveBeenCalledWith("v");
    });
});
