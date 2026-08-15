import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { extractDocx, extractPdfText, extractXlsx, sniffFormat } from "@services/utils/extract";

describe("sniffFormat", () => {
    it("routes by MIME first, extension as fallback", () => {
        expect(sniffFormat("a.pdf", "application/pdf")).toBe("pdf");
        expect(sniffFormat("a.pdf", "")).toBe("pdf");
        expect(
            sniffFormat(
                "a.docx",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ),
        ).toBe("docx");
        expect(sniffFormat("a.docx", "")).toBe("docx");
        expect(sniffFormat("a.xlsx", "")).toBe("xlsx");
        expect(sniffFormat("a.xlsm", "")).toBe("xlsx");
        expect(sniffFormat("photo.jpeg", "image/jpeg")).toBe("image");
        expect(sniffFormat("photo.webp", "")).toBe("image");
        expect(sniffFormat("notes.md", "")).toBe("text");
        expect(sniffFormat("data.json", "application/json")).toBe("text");
    });

    it("names legacy Office formats so the error can say re-export", () => {
        expect(sniffFormat("old.doc", "application/msword")).toBe("legacy");
        expect(sniffFormat("old.xls", "")).toBe("legacy");
    });

    it("rejects the rest", () => {
        expect(sniffFormat("movie.mp4", "video/mp4")).toBe("unsupported");
        expect(sniffFormat("archive.zip", "application/zip")).toBe("unsupported");
    });
});

// fixtures are authored with pdf-lib (a writer), so the reader under test isn't checking itself
async function pdfWith(pages: string[][]): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (const lines of pages) {
        const page = doc.addPage([400, 400]);
        lines.forEach((line, i) => page.drawText(line, { x: 40, y: 340 - i * 24, font, size: 12 }));
    }
    return doc.save();
}

describe("extractPdfText", () => {
    it("reads the text layer across pages, in order", async () => {
        const bytes = await pdfWith([
            ["The Lumen One runs at 18 decibels.", "Filters cost $12 per quarter."],
            ["Page two carries the warranty terms."],
        ]);
        const out = await extractPdfText(bytes);
        expect(out.pages).toBe(2);
        expect(out.text).toContain("18 decibels");
        expect(out.text).toContain("warranty terms");
        expect(out.text.indexOf("18 decibels")).toBeLessThan(out.text.indexOf("warranty"));
        expect(out.charsPerPage).toBeGreaterThan(30);
    });

    it("reports a near-zero density for a scan-like PDF with no text layer", async () => {
        const bytes = await pdfWith([[], [], []]);
        const out = await extractPdfText(bytes);
        expect(out.pages).toBe(3);
        expect(out.charsPerPage).toBeLessThan(5);
    });
});

const DOCX_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Voice guidelines</w:t></w:r></w:p>
    <w:p><w:r><w:t xml:space="preserve">Plain beats </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>poetic</w:t></w:r><w:r><w:t>.</w:t></w:r></w:p>
    <w:p><w:r><w:t>Tabs</w:t><w:tab/><w:t>separate</w:t></w:r><w:r><w:br/><w:t>and breaks split &amp; entities decode</w:t></w:r></w:p>
    <w:tbl><w:tr><w:tc><w:p><w:r><w:t>cell one</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>cell two</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
  </w:body>
</w:document>`;

describe("extractDocx", () => {
    it("joins runs, honors paragraphs/tabs/breaks, decodes entities, reads table cells", async () => {
        const zip = new JSZip();
        zip.file("word/document.xml", DOCX_XML);
        zip.file("[Content_Types].xml", "<Types/>");
        const text = await extractDocx(await zip.generateAsync({ type: "uint8array" }));
        expect(text).toContain("Voice guidelines");
        expect(text).toContain("Plain beats poetic."); // split runs re-join without seams
        expect(text).toContain("Tabs\tseparate");
        expect(text).toContain("and breaks split & entities decode");
        expect(text).toContain("cell one");
        expect(text).toContain("cell two");
        expect(text).not.toContain("<w:"); // no structure leaks
    });

    it("refuses a zip that isn't a Word document", async () => {
        const zip = new JSZip();
        zip.file("hello.txt", "not a docx");
        await expect(extractDocx(await zip.generateAsync({ type: "uint8array" }))).rejects.toThrow(
            /not a Word document/,
        );
    });
});

const WORKBOOK_XML = `<?xml version="1.0"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheets><sheet name="Metrics" sheetId="1" r:id="rId1" xmlns:r="x"/><sheet name="Notes &amp; Risks" sheetId="2" r:id="rId2" xmlns:r="x"/></sheets>
</workbook>`;
const SHARED_XML = `<?xml version="1.0"?>
<sst><si><t>Quarter</t></si><si><t>Revenue, USD</t></si><si><r><t>Q</t></r><r><t>3</t></r></si></sst>`;
const SHEET1_XML = `<?xml version="1.0"?>
<worksheet><sheetData>
  <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
  <row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>4800000</v></c><c r="C2" t="b"><v>1</v></c></row>
  <row r="3"><c r="A3" t="inlineStr"><is><t>note with, comma</t></is></c><c r="B3" t="str"><v>=SUM cached</v></c></row>
  <row r="4"></row>
</sheetData></worksheet>`;
const SHEET2_XML = `<?xml version="1.0"?>
<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>churn risk</t></is></c></row></sheetData></worksheet>`;

describe("extractXlsx", () => {
    it("serializes sheets as named blocks of CSV lines, resolving every cell type", async () => {
        const zip = new JSZip();
        zip.file("xl/workbook.xml", WORKBOOK_XML);
        zip.file("xl/sharedStrings.xml", SHARED_XML);
        zip.file("xl/worksheets/sheet1.xml", SHEET1_XML);
        zip.file("xl/worksheets/sheet2.xml", SHEET2_XML);
        const text = await extractXlsx(await zip.generateAsync({ type: "uint8array" }));
        expect(text).toContain("## Metrics");
        expect(text).toContain("## Notes & Risks"); // sheet-name entities decode
        expect(text).toContain('Quarter,"Revenue, USD"'); // shared strings + CSV quoting
        expect(text).toContain("Q3,4800000,TRUE"); // rich-run shared string, number, boolean
        expect(text).toContain('"note with, comma",=SUM cached'); // inlineStr + formula cache
        expect(text).toContain("churn risk");
        expect(text.indexOf("## Metrics")).toBeLessThan(text.indexOf("## Notes"));
    });

    it("refuses a zip that isn't a spreadsheet", async () => {
        const zip = new JSZip();
        zip.file("word/document.xml", DOCX_XML);
        await expect(extractXlsx(await zip.generateAsync({ type: "uint8array" }))).rejects.toThrow(
            /not a spreadsheet/,
        );
    });
});
