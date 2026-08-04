// doc-PDF page-per-section invariants over a content-rich artifact
import "@elements/register";
import { describe, expect, it } from "vitest";
import { resolveProfile } from "@engine/profile";
import { layoutSection } from "@canvas/render/commands";
import { docSectionPageSize } from "@canvas/render/export";
import { measure, tokens } from "@canvas/testkit";
import { richDoc } from "./richdoc.testkit";

describe("doc pdf page-per-section on a rich doc", () => {
    it("every section yields a positive-height page containing all its commands", () => {
        const docProfile = resolveProfile("doc");
        const layoutW = docProfile.maxContentWidth ?? 744;
        for (const section of richDoc.sections) {
            const { commands, height } = layoutSection(
                section,
                layoutW,
                measure,
                tokens,
                docProfile,
            );
            expect(height, section.id).toBeGreaterThan(0);
            for (const c of commands) {
                expect(c.box.y, `${section.id} command above page top`).toBeGreaterThanOrEqual(
                    -0.5,
                );
                expect(
                    c.box.y + c.box.h,
                    `${section.id} command past page bottom`,
                ).toBeLessThanOrEqual(height + 0.5);
            }
            const page = docSectionPageSize(layoutW, height);
            expect(page.h).toBeCloseTo((height * page.w) / layoutW, 4);
        }
    });
});
