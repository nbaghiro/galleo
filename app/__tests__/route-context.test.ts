import { describe, expect, it } from "vitest";
import { getContext } from "@ui/keys";
import { publishRoute } from "../stores/route-context";

describe("publishRoute", () => {
    it("maps each route to its context key (base-prefix stripped)", () => {
        publishRoute("/app/templates");
        expect(getContext("templates")).toBe(true);
        expect(getContext("library")).toBe(false);
        expect(getContext("editor")).toBe(false);

        publishRoute("/app/");
        expect(getContext("library")).toBe(true);
        expect(getContext("templates")).toBe(false);

        publishRoute("/app/folder/f1");
        expect(getContext("library")).toBe(true);

        publishRoute("/app/edit/abc123");
        expect(getContext("editor")).toBe(true);
        expect(getContext("library")).toBe(false);

        publishRoute("/app/trash");
        expect(getContext("trash")).toBe(true);
        expect(getContext("editor")).toBe(false);
    });
});
