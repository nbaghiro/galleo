import type { ArtifactContent, SectionOp } from "@model/artifact";

// applied server-side, and shared here so a windowed client can predict what the server will do

export type ApplyResult = { ok: true; content: ArtifactContent } | { ok: false; reason: string }; // the whole batch is rejected, never half-applied

/** Applied in order to a fresh copy; an unknown section id means client and server disagree. */
export function applySectionOps(content: ArtifactContent, ops: SectionOp[]): ApplyResult {
    let sections = [...content.sections];
    let shell = {
        format: content.format,
        theme: content.theme,
        ...(content.background ? { background: content.background } : {}),
    };
    for (const op of ops) {
        if (op.kind === "set") {
            const at = sections.findIndex((s) => s.id === op.section.id);
            if (at < 0) return { ok: false, reason: `unknown section ${op.section.id}` };
            sections[at] = op.section;
        } else if (op.kind === "insert") {
            if (sections.some((s) => s.id === op.section.id))
                return { ok: false, reason: `duplicate section ${op.section.id}` };
            const at = Math.max(0, Math.min(sections.length, Math.trunc(op.index)));
            sections.splice(at, 0, op.section);
        } else if (op.kind === "remove") {
            const at = sections.findIndex((s) => s.id === op.id);
            if (at < 0) return { ok: false, reason: `unknown section ${op.id}` };
            sections.splice(at, 1);
        } else if (op.kind === "order") {
            const by = new Map(sections.map((s) => [s.id, s]));
            if (op.ids.length !== sections.length || op.ids.some((id) => !by.has(id)))
                return { ok: false, reason: "order is not a permutation of the document" };
            sections = op.ids.map((id) => by.get(id)!);
        } else {
            shell = { ...shell, ...op.shell };
        }
    }
    return { ok: true, content: { ...shell, sections } };
}

/** Diffs by section identity: editor ops preserve it, so an unchanged section is free to detect. */
export function diffSections(before: ArtifactContent, after: ArtifactContent): SectionOp[] {
    const ops: SectionOp[] = [];
    const had = new Map(before.sections.map((s) => [s.id, s]));
    const has = new Set(after.sections.map((s) => s.id));

    for (const s of before.sections) if (!has.has(s.id)) ops.push({ kind: "remove", id: s.id });
    after.sections.forEach((s, i) => {
        const prev = had.get(s.id);
        if (!prev) ops.push({ kind: "insert", section: s, index: i });
        else if (prev !== s) ops.push({ kind: "set", section: s });
    });
    // reorder only if the surviving sections changed places; inserts already carry their index
    const kept = before.sections.filter((s) => has.has(s.id)).map((s) => s.id);
    const keptAfter = after.sections.filter((s) => had.has(s.id)).map((s) => s.id);
    if (kept.join() !== keptAfter.join())
        ops.push({ kind: "order", ids: after.sections.map((s) => s.id) });

    if (
        before.format !== after.format ||
        before.theme !== after.theme ||
        before.background !== after.background
    )
        ops.push({
            kind: "shell",
            shell: {
                format: after.format,
                theme: after.theme,
                ...(after.background ? { background: after.background } : {}),
            },
        });
    return ops;
}
