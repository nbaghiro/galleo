import { describe, expect, it } from "vitest";
import { DOC_ARTICLES, docFor, searchDocs } from "../docs";

describe("public documentation", () => {
    it("resolves unique article routes, including trailing slashes", () => {
        expect(new Set(DOC_ARTICLES.map((article) => article.slug)).size).toBe(DOC_ARTICLES.length);
        for (const article of DOC_ARTICLES) {
            expect(docFor(`/docs/${article.slug}/`)).toBe(article);
            expect(new Set(article.sections.map((section) => section.id)).size).toBe(
                article.sections.length,
            );
        }
        expect(docFor("/docs/missing")).toBeUndefined();
    });
    it("finds answers in article bodies, ignoring case and extra whitespace", () => {
        expect(searchDocs("  GOOGLE   editable ").map((article) => article.slug)).toContain(
            "present-export",
        );
        expect(searchDocs("zzzz-no-match")).toEqual([]);
        expect(searchDocs(" ")).toEqual(DOC_ARTICLES);
    });
});
