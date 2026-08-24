import { describe, expect, it } from "vitest";
import PptxGenJS from "pptxgenjs";
import JSZip from "jszip";
import {
    emuToPx,
    kid,
    kids,
    parseChartXml,
    parsePptx,
    parseXml,
    parasText,
    type PptxShape,
} from "@services/utils/pptx";

const PNG_1PX =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const sp = (s: PptxShape): Extract<PptxShape, { kind: "sp" }> => {
    if (s.kind !== "sp") throw new Error(`expected sp, got ${s.kind}`);
    return s;
};

describe("parseXml", () => {
    it("builds a tree with attributes and text", () => {
        const root = parseXml('<a x="1"><b y="2">hi</b><c/></a>');
        expect(root.name).toBe("a");
        expect(root.attrs.x).toBe("1");
        expect(kid(root, "b")?.text).toBe("hi");
        expect(kid(root, "c")).toBeTruthy();
    });

    it("localizes element names but keeps attribute prefixes", () => {
        const root = parseXml('<p:sldId id="256" r:id="rId2"/>');
        expect(root.name).toBe("sldId");
        expect(root.attrs.id).toBe("256");
        expect(root.attrs["r:id"]).toBe("rId2");
    });

    it("decodes entities and CDATA", () => {
        const root = parseXml("<t a='A &amp; B'>x &lt;y&gt;<![CDATA[<raw>]]></t>");
        expect(root.attrs.a).toBe("A & B");
        expect(root.text).toBe("x <y><raw>");
    });

    it("skips comments and declarations", () => {
        const root = parseXml('<?xml version="1.0"?><!-- note --><a><b/></a>');
        expect(root.name).toBe("a");
        expect(kids(root, "b")).toHaveLength(1);
    });
});

describe("emuToPx", () => {
    it("converts at 9525 EMU per pixel", () => {
        expect(emuToPx(914400)).toBe(96); // one inch
        expect(emuToPx(12192000)).toBe(1280);
    });
});

describe("parseChartXml", () => {
    const chart = (plot: string): string =>
        `<c:chartSpace xmlns:c="x"><c:chart><c:plotArea>${plot}</c:plotArea></c:chart></c:chartSpace>`;
    const ser = `
        <c:ser>
            <c:tx><c:strRef><c:strCache><c:pt idx="0"><c:v>Units</c:v></c:pt></c:strCache></c:strRef></c:tx>
            <c:cat><c:strRef><c:strCache>
                <c:pt idx="0"><c:v>North</c:v></c:pt><c:pt idx="1"><c:v>South</c:v></c:pt>
            </c:strCache></c:strRef></c:cat>
            <c:val><c:numRef><c:numCache>
                <c:pt idx="1"><c:v>540</c:v></c:pt><c:pt idx="0"><c:v>820</c:v></c:pt>
            </c:numCache></c:numRef></c:val>
        </c:ser>`;

    it("reads a column chart with named series, ordering points by idx", () => {
        const parsed = parseChartXml(chart(`<c:barChart><c:barDir val="col"/>${ser}</c:barChart>`));
        expect(parsed).toEqual({
            type: "column",
            categories: ["North", "South"],
            series: [{ name: "Units", values: [820, 540] }],
        });
    });

    it("maps barDir=bar to horizontal bars and doughnut to donut", () => {
        expect(
            parseChartXml(chart(`<c:barChart><c:barDir val="bar"/>${ser}</c:barChart>`))?.type,
        ).toBe("bar");
        expect(parseChartXml(chart(`<c:doughnutChart>${ser}</c:doughnutChart>`))?.type).toBe(
            "donut",
        );
    });

    it("returns null when no series exist", () => {
        expect(parseChartXml(chart("<c:barChart/>"))).toBeNull();
    });
});

describe("parsePptx over a pptxgenjs deck", () => {
    async function buildDeck(): Promise<Uint8Array> {
        const pptx = new PptxGenJS();
        pptx.title = "Fixture Deck";
        pptx.defineLayout({ name: "WIDE", width: 13.333, height: 7.5 });
        pptx.layout = "WIDE";
        const s1 = pptx.addSlide();
        s1.background = { color: "112233" };
        s1.addText("Quarterly Review", { x: 1, y: 0.5, w: 8, h: 1, fontSize: 40, bold: true });
        s1.addText(
            [
                { text: "First point", options: { bullet: true, breakLine: true } },
                { text: "Second point", options: { bullet: true } },
            ],
            { x: 1, y: 2, w: 5, h: 2, fontSize: 18 },
        );
        s1.addImage({ data: `image/png;base64,${PNG_1PX}`, x: 7, y: 2, w: 2, h: 2 });
        s1.addNotes("Say hello first.");
        const s2 = pptx.addSlide();
        s2.addTable(
            [
                [{ text: "Region" }, { text: "Units" }],
                [{ text: "North" }, { text: "820" }],
            ],
            { x: 1, y: 1, w: 8 },
        );
        s2.addChart(
            pptx.ChartType.bar,
            [{ name: "Units", labels: ["North", "South"], values: [820, 540] }],
            { x: 1, y: 3, w: 8, h: 3, barDir: "col" },
        );
        const buf = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
        return new Uint8Array(buf);
    }

    it("round-trips size, text, bullets, image, notes, table, and chart", async () => {
        const deck = await parsePptx(await buildDeck());
        expect(deck.w).toBe(1280);
        expect(deck.h).toBe(720);
        expect(deck.title).toBe("Fixture Deck");
        expect(deck.slides).toHaveLength(2);

        const [s1, s2] = deck.slides;
        expect(s1!.bg?.color).toBe("#112233");
        expect(s1!.notes).toBe("Say hello first.");

        const texts = s1!.shapes.filter((s) => s.kind === "sp").map(sp);
        const title = texts.find((t) => parasText(t.paras) === "Quarterly Review")!;
        expect(title).toBeTruthy();
        expect(title.box.x).toBe(96); // 1in
        expect(title.paras[0]!.runs[0]!.b).toBe(true);
        expect(title.paras[0]!.runs[0]!.sz).toBe(40);

        const bullets = texts.find((t) => parasText(t.paras).includes("First point"))!;
        expect(bullets.paras.filter((p) => p.runs.length > 0).every((p) => p.bullet)).toBe(true);

        const pic = s1!.shapes.find((s) => s.kind === "picture");
        expect(pic?.kind).toBe("picture");
        if (pic?.kind === "picture") {
            expect(pic.media.mime).toBe("image/png");
            expect(pic.media.data.length).toBeGreaterThan(0);
        }

        const table = s2!.shapes.find((s) => s.kind === "table");
        expect(table?.kind).toBe("table");
        if (table?.kind === "table")
            expect(table.cells).toEqual([
                ["Region", "Units"],
                ["North", "820"],
            ]);

        const chart = s2!.shapes.find((s) => s.kind === "chart");
        expect(chart?.kind).toBe("chart");
        if (chart?.kind === "chart") {
            expect(chart.chart.type).toBe("column");
            expect(chart.chart.categories).toEqual(["North", "South"]);
            expect(chart.chart.series).toEqual([{ name: "Units", values: [820, 540] }]);
        }
    });
});

describe("parsePptx over a hand-built package", () => {
    const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    const rels = (entries: [string, string, string][]): string =>
        `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${entries
            .map(
                ([id, type, target]) =>
                    `<Relationship Id="${id}" Type="${type}" Target="${target}"/>`,
            )
            .join("")}</Relationships>`;

    async function buildPackage(): Promise<Uint8Array> {
        const zip = new JSZip();
        zip.file(
            "ppt/presentation.xml",
            `<p:presentation xmlns:p="p" xmlns:r="r">
                <p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst>
                <p:sldSz cx="9144000" cy="6858000"/>
            </p:presentation>`,
        );
        zip.file(
            "ppt/_rels/presentation.xml.rels",
            rels([
                [`rId1`, `${REL_NS}/slide`, "slides/slide1.xml"],
                [`rId2`, `${REL_NS}/theme`, "theme/theme1.xml"],
            ]),
        );
        zip.file(
            "ppt/theme/theme1.xml",
            `<a:theme xmlns:a="a"><a:themeElements><a:clrScheme name="x">
                <a:dk1><a:sysClr val="windowText" lastClr="101010"/></a:dk1>
                <a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>
                <a:accent1><a:srgbClr val="FF0000"/></a:accent1>
            </a:clrScheme></a:themeElements></a:theme>`,
        );
        // the title carries no xfrm of its own: the box must come from the layout
        zip.file(
            "ppt/slides/slide1.xml",
            `<p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree>
                <p:sp>
                    <p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
                    <p:spPr/>
                    <p:txBody><a:p><a:r>
                        <a:rPr b="1"><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></a:rPr>
                        <a:t>Hello</a:t>
                    </a:r></a:p></p:txBody>
                </p:sp>
                <p:grpSp>
                    <p:grpSpPr><a:xfrm>
                        <a:off x="914400" y="914400"/><a:ext cx="1828800" cy="914400"/>
                        <a:chOff x="0" y="0"/><a:chExt cx="914400" cy="914400"/>
                    </a:xfrm></p:grpSpPr>
                    <p:sp>
                        <p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="457200" cy="457200"/></a:xfrm>
                        <a:prstGeom prst="rect"/><a:solidFill><a:srgbClr val="00FF00"/></a:solidFill></p:spPr>
                    </p:sp>
                </p:grpSp>
            </p:spTree></p:cSld></p:sld>`,
        );
        zip.file(
            "ppt/slides/_rels/slide1.xml.rels",
            rels([[`rId1`, `${REL_NS}/slideLayout`, "../slideLayouts/slideLayout1.xml"]]),
        );
        zip.file(
            "ppt/slideLayouts/slideLayout1.xml",
            `<p:sldLayout xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree>
                <p:sp>
                    <p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
                    <p:spPr><a:xfrm><a:off x="914400" y="457200"/><a:ext cx="7315200" cy="1143000"/></a:xfrm></p:spPr>
                </p:sp>
            </p:spTree></p:cSld></p:sldLayout>`,
        );
        return zip.generateAsync({ type: "uint8array" });
    }

    it("inherits placeholder boxes, resolves scheme colors, and flattens groups", async () => {
        const deck = await parsePptx(await buildPackage());
        expect(deck.w).toBe(960); // 4:3
        expect(deck.h).toBe(720);
        expect(deck.scheme.accent1).toBe("#ff0000");
        expect(deck.scheme.dk1).toBe("#101010");

        const shapes = deck.slides[0]!.shapes.map(sp);
        const title = shapes.find((s) => parasText(s.paras) === "Hello")!;
        expect(title.role).toBe("title");
        expect(title.box).toEqual({ x: 96, y: 48, w: 768, h: 120 });
        expect(title.paras[0]!.runs[0]!.color).toBe("#ff0000");

        // group child: 0..457200 EMU inside a chExt of 914400 mapped onto a 1828800-wide box at
        // (914400, 914400) → half the group's width, so 96..192px horizontally
        const grouped = shapes.find((s) => s.fill === "#00ff00")!;
        expect(grouped.box).toEqual({ x: 96, y: 96, w: 96, h: 48 });
        expect(grouped.geom).toBe("rect");
    });
});
