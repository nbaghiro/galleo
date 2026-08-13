import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { authed, jsonInit, seedUser } from "../../__tests__/harness";
import { db } from "../../db/client";
import { schema } from "../../db/schema";
import { addTextItem, createContext } from "../../core/context";
import type { Embedder } from "../../core/ai/embed";

const fakeEmbed: Embedder = (texts) =>
    Promise.resolve(texts.map(() => new Array<number>(768).fill(0.1)));

async function pdfBase64(lines: string[]): Promise<string> {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([400, 400]);
    lines.forEach((line, i) => page.drawText(line, { x: 40, y: 340 - i * 24, font, size: 12 }));
    return Buffer.from(await doc.save()).toString("base64");
}

describe("POST /extract", () => {
    it("turns a PDF into text the unchanged items route then ingests", async () => {
        const { userId, workspaceId } = await seedUser();
        const data = await pdfBase64([
            "Helios commissioned fourteen arrays in Q3.",
            "Fleet availability held at 98.6 percent.",
        ]);
        const res = await authed(
            userId,
            "/extract",
            jsonInit("POST", { name: "q3.pdf", mime: "application/pdf", data }),
        );
        expect(res.status).toBe(200);
        const out = (await res.json()) as { title: string; text: string; via: string };
        expect(out.title).toBe("q3.pdf");
        expect(out.via).toBe("text");
        expect(out.text).toContain("98.6 percent");

        // the extracted text rides the normal ingestion path, unchanged
        const { id: ctx } = await createContext(workspaceId, userId, "Uploads");
        const item = await addTextItem(
            workspaceId,
            ctx,
            userId,
            "file",
            out.title,
            out.text,
            fakeEmbed,
        );
        const chunks = await db
            .select()
            .from(schema.chunks)
            .where(eq(schema.chunks.refId, item.id));
        expect(chunks.length).toBeGreaterThan(0);
        expect(chunks[0]!.text).toContain("fourteen arrays");
    });

    it("maps typed extraction failures to 400 with the copy", async () => {
        const { userId } = await seedUser();
        const res = await authed(
            userId,
            "/extract",
            jsonInit("POST", { name: "old.xls", mime: "", data: "eA==" }),
        );
        expect(res.status).toBe(400);
        expect(((await res.json()) as { error: string }).error).toContain("save it as .docx");
    });

    it("requires a file", async () => {
        const { userId } = await seedUser();
        const res = await authed(userId, "/extract", jsonInit("POST", { name: "x.pdf" }));
        expect(res.status).toBe(400);
    });

    // last in the file on purpose: the limiter bucket persists for this worker
    it("rate-limits repeated extraction", async () => {
        const { userId } = await seedUser();
        let limited = false;
        for (let i = 0; i < 25 && !limited; i++) {
            const res = await authed(
                userId,
                "/extract",
                jsonInit("POST", { name: "x.mp4", mime: "video/mp4", data: "eA==" }),
            );
            limited = res.status === 429;
        }
        expect(limited).toBe(true);
    });
});
