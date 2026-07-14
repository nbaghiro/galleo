import { describe, expect, it } from "vitest";
import { getContext } from "@ui/keys";
import { publishRoute } from "../stores/route-context";

describe("publishRoute", () => {
    it("maps each root-relative route to its context key", () => {
        publishRoute("/templates");
        expect(getContext("templates")).toBe(true);
        expect(getContext("library")).toBe(false);
        expect(getContext("editor")).toBe(false);

        publishRoute("/");
        expect(getContext("library")).toBe(true);
        expect(getContext("templates")).toBe(false);

        publishRoute("/folder/f1");
        expect(getContext("library")).toBe(true);

        publishRoute("/edit/abc123");
        expect(getContext("editor")).toBe(true);
        expect(getContext("library")).toBe(false);

        publishRoute("/trash");
        expect(getContext("trash")).toBe(true);
        expect(getContext("editor")).toBe(false);
    });
});
