import { describe, expect, it } from "vitest";
import type { ArtifactAccess } from "@model/artifact";
import { accessFor, atLeast, isAccess, isGrantable } from "@model/artifact";
import { canPublish, isAdmin, isPublishPolicy } from "@model/workspace";

const LEVELS: ArtifactAccess[] = ["none", "view", "comment", "edit"];

describe("atLeast", () => {
    it("orders the levels so each contains the ones below it", () => {
        expect(atLeast("edit", "comment")).toBe(true);
        expect(atLeast("edit", "view")).toBe(true);
        expect(atLeast("comment", "view")).toBe(true);
        expect(atLeast("view", "none")).toBe(true);
    });

    it("refuses a level above the one held", () => {
        expect(atLeast("view", "comment")).toBe(false);
        expect(atLeast("comment", "edit")).toBe(false);
        expect(atLeast("none", "view")).toBe(false);
    });

    it("is reflexive at every level", () => {
        for (const level of LEVELS) expect(atLeast(level, level)).toBe(true);
    });
});

describe("isAccess", () => {
    it("accepts every level and nothing else", () => {
        for (const level of LEVELS) expect(isAccess(level)).toBe(true);
        expect(isAccess("admin")).toBe(false);
        expect(isAccess("")).toBe(false);
        expect(isAccess(null)).toBe(false);
        expect(isAccess(3)).toBe(false);
    });

    it("does not treat an inherited object property as a level", () => {
        expect(isAccess("toString")).toBe(false);
        expect(isAccess("constructor")).toBe(false);
    });
});

describe("accessFor", () => {
    const member = { role: "member" as const, userId: "u1" };

    it("gives an owner and an admin edit whatever the artifact says", () => {
        for (const role of ["owner", "admin"] as const) {
            expect(accessFor({ role, userId: "u9", memberAccess: "none" })).toBe("edit");
            expect(
                accessFor({ role, userId: "u9", memberAccess: "view", workspaceDefault: "none" }),
            ).toBe("edit");
        }
    });

    it("gives the creator edit on their own artifact even when it is locked down", () => {
        expect(accessFor({ ...member, createdBy: "u1", memberAccess: "none" })).toBe("edit");
    });

    it("does not give a member edit on someone else's locked artifact", () => {
        expect(accessFor({ ...member, createdBy: "u2", memberAccess: "none" })).toBe("none");
    });

    it("uses the artifact's own level when it has one", () => {
        expect(accessFor({ ...member, createdBy: "u2", memberAccess: "comment" })).toBe("comment");
    });

    it("falls back to the workspace default when the artifact sets none", () => {
        expect(
            accessFor({ ...member, createdBy: "u2", memberAccess: null, workspaceDefault: "view" }),
        ).toBe("view");
    });

    it("lets an explicit level beat the workspace default in both directions", () => {
        // tighter than the default
        expect(
            accessFor({
                ...member,
                createdBy: "u2",
                memberAccess: "view",
                workspaceDefault: "edit",
            }),
        ).toBe("view");
        // looser than the default: the artifact still wins, unlike Gamma's workspace-wins model
        expect(
            accessFor({
                ...member,
                createdBy: "u2",
                memberAccess: "edit",
                workspaceDefault: "view",
            }),
        ).toBe("edit");
    });

    it("defaults to edit when neither the artifact nor the workspace says anything", () => {
        expect(accessFor({ ...member, createdBy: "u2" })).toBe("edit");
    });

    it("treats an artifact with no recorded creator as belonging to nobody", () => {
        expect(accessFor({ ...member, createdBy: null, memberAccess: "view" })).toBe("view");
    });
});

// A per-user grant sits one step more specific than the artifact's own level and follows the same
// rule: explicit beats inherited, in both directions.
describe("accessFor with a per-user grant", () => {
    const member = { role: "member" as const, userId: "u1", createdBy: "u2" };

    it("lowers a plain member below an edit default", () => {
        expect(accessFor({ ...member, workspaceDefault: "edit", grant: "view" })).toBe("view");
        expect(accessFor({ ...member, memberAccess: "edit", grant: "comment" })).toBe("comment");
    });

    it("raises a member the artifact locked out", () => {
        expect(accessFor({ ...member, memberAccess: "none", grant: "comment" })).toBe("comment");
        expect(accessFor({ ...member, workspaceDefault: "none", grant: "edit" })).toBe("edit");
    });

    it("never lowers an admin, an owner, or the creator", () => {
        for (const role of ["owner", "admin"] as const)
            expect(accessFor({ role, userId: "u1", createdBy: "u2", grant: "view" })).toBe("edit");
        expect(accessFor({ ...member, createdBy: "u1", grant: "view" })).toBe("edit");
    });

    it("falls through to the artifact's level and then the default when there is no grant", () => {
        expect(accessFor({ ...member, memberAccess: "comment", grant: null })).toBe("comment");
        expect(accessFor({ ...member, workspaceDefault: "view", grant: null })).toBe("view");
    });

    it("is the only thing a non-member has", () => {
        const outsider = { role: null, userId: "u1", createdBy: "u2" };
        expect(accessFor({ ...outsider, memberAccess: "edit", workspaceDefault: "edit" })).toBe(
            "none",
        );
        expect(accessFor({ ...outsider, grant: "comment" })).toBe("comment");
        // and being recorded as the creator does not survive leaving the workspace
        expect(accessFor({ role: null, userId: "u1", createdBy: "u1" })).toBe("none");
    });
});

describe("isGrantable", () => {
    it("takes the three levels a grant may carry and refuses none", () => {
        expect(isGrantable("view")).toBe(true);
        expect(isGrantable("comment")).toBe(true);
        expect(isGrantable("edit")).toBe(true);
        expect(isGrantable("none")).toBe(false);
        expect(isGrantable("toString")).toBe(false);
        expect(isGrantable(null)).toBe(false);
    });
});

describe("isAdmin", () => {
    it("counts the owner and admins, not plain members", () => {
        expect(isAdmin("owner")).toBe(true);
        expect(isAdmin("admin")).toBe(true);
        expect(isAdmin("member")).toBe(false);
    });
});

describe("publish policy", () => {
    it("accepts the two policies and nothing else", () => {
        expect(isPublishPolicy("members")).toBe(true);
        expect(isPublishPolicy("admins")).toBe(true);
        expect(isPublishPolicy("owner")).toBe(false);
        expect(isPublishPolicy(null)).toBe(false);
    });

    it("lets anyone publish under the members policy", () => {
        for (const role of ["owner", "admin", "member"] as const)
            expect(canPublish(role, "members")).toBe(true);
    });

    it("restricts publishing to admins and the owner under the admins policy", () => {
        expect(canPublish("owner", "admins")).toBe(true);
        expect(canPublish("admin", "admins")).toBe(true);
        expect(canPublish("member", "admins")).toBe(false);
    });
});
