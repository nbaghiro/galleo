import type { ArtifactContent } from "@model/content";
import { bullets, cell, chart, deck, group, img, quote, section, stat, t } from "./build";

export const helios: ArtifactContent = deck("signal", [
    section("s1", "full", {
        a: cell(
            group(
                t("2026 REPORT", "eyebrow"),
                t("State of the Grid", "display"),
                t("How the clean-energy transition actually performed this year — the wins, the bottlenecks, and what bends the curve next.", "lead"),
            ),
        ),
    }),
    section("s2", "three-up", {
        a: cell(stat("41%", "renewables share")),
        b: cell(stat("2.3x", "storage deployed")),
        c: cell(stat("18 GW", "stuck in queue")),
    }),
    section("s3", "split-6040", {
        a: cell(
            group(
                t("Findings", "eyebrow"),
                t("Generation isn’t the problem anymore", "h2"),
                bullets("Solar is the cheapest power in history", "Interconnection queues are the new bottleneck", "Storage, not panels, decides 2030"),
            ),
        ),
        b: cell(chart("line", "31, 34, 37, 39, 41", 300)),
    }),
    section("s4", "full", { a: cell(quote("We solved the hard physics. What’s left is permitting.", "— Dr. Idris Bello, grid analyst")) }),
    section("s5", "two-col", {
        a: cell(group(t("What’s working", "title"), bullets("Falling battery costs", "Corporate PPAs at scale", "Transmission reform pilots"))),
        b: cell(group(t("What’s stuck", "title"), bullets("Multi-year permit timelines", "Workforce shortages", "Aging transmission lines"))),
    }),
    section("s6", "split-4060", {
        a: cell(img("helios-grid", 1.0, 10)),
        b: cell(
            group(
                t("Outlook", "eyebrow"),
                t("The decisive decade", "h2"),
                t("If permitting reform lands, the grid decarbonizes a decade early. If it stalls, cheap clean power sits stranded behind paperwork.", "body"),
            ),
        ),
    }),
]);
