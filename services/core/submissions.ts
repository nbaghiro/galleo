import { desc, eq, sql } from "drizzle-orm";
import { asFormat } from "@model/analytics";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import { capture } from "@services/utils/analytics";

// What a published form collected. Recording owns every decision — the honeypot drop, the
// per-artifact cap, the one server-side event — so a second caller cannot skip any of them.

// guards the table, not a product promise; a workspace at this volume needs a real form product
const MAX_PER_ARTIFACT = 10_000;

export interface SubmissionRecord {
    id: string;
    elementId: string;
    payload: Record<string, string>;
    createdAt: Date;
}

export async function recordSubmission(o: {
    artifactId: string;
    workspaceId: string;
    format?: string;
    viewerKey: string; // the link id: the anonymous session the event is attributed to
    elementId: string;
    values: Record<string, string>;
    honeypot?: string;
}): Promise<boolean> {
    // a filled trap answers ok and stores nothing, so a bot learns nothing from the response
    if (o.honeypot) return true;
    if (!Object.keys(o.values).length) return false;
    const [row] = await db
        .select({ n: sql<string>`count(*)` })
        .from(schema.formSubmissions)
        .where(eq(schema.formSubmissions.artifactId, o.artifactId));
    if (Number(row?.n ?? 0) >= MAX_PER_ARTIFACT) return false;
    await db.insert(schema.formSubmissions).values({
        artifactId: o.artifactId,
        elementId: o.elementId,
        payload: o.values,
    });
    capture(
        { userId: o.viewerKey, anonymous: true, workspaceId: o.workspaceId },
        "form_submitted",
        { artifact_format: asFormat(o.format), field_count: Object.keys(o.values).length },
    );
    return true;
}

export async function listSubmissions(artifactId: string): Promise<SubmissionRecord[]> {
    return db
        .select({
            id: schema.formSubmissions.id,
            elementId: schema.formSubmissions.elementId,
            payload: schema.formSubmissions.payload,
            createdAt: schema.formSubmissions.createdAt,
        })
        .from(schema.formSubmissions)
        .where(eq(schema.formSubmissions.artifactId, artifactId))
        .orderBy(desc(schema.formSubmissions.createdAt))
        .limit(1000);
}
