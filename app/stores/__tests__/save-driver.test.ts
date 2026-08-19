// @vitest-environment happy-dom
import "@elements/register";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "solid-js";
import type { ArtifactContent, Section, SectionOp } from "@model/artifact";
import { sectionOf } from "@canvas/testkit";
import { commit, editor, loadArtifactContent } from "@editor/core/store";
import {
    flushAutosave,
    installAutosave,
    noteSavedContent,
    onCollabDriving,
} from "@app/stores/save";
import { backoffFor, CollabClient, type CollabSink, type SocketLike } from "@app/stores/collab";

// One baseline, two drivers. These tests are about which of them is allowed to write at any moment,
// and about the handover in both directions.

const sec = (id: string, text = id): Section =>
    sectionOf({ type: "text", id: `e-${id}`, data: { text } }, { id });
const doc: ArtifactContent = { format: "deck", theme: "studio", sections: [sec("s1")] };

interface Call {
    url: string;
    method: string;
    body: Record<string, unknown>;
}
let calls: Call[] = [];

const saves = (): Call[] => calls.filter((c) => c.method === "PATCH" || c.method === "PUT");
const opsSent = (): SectionOp[] =>
    saves().flatMap((c) => (c.body.ops as SectionOp[] | undefined) ?? []);

function stubFetch(): void {
    vi.stubGlobal(
        "fetch",
        vi.fn((url: string, init?: RequestInit) => {
            calls.push({
                url,
                method: init?.method ?? "GET",
                body: JSON.parse((init?.body as string) ?? "{}") as Record<string, unknown>,
            });
            return Promise.resolve({
                ok: true,
                status: 200,
                statusText: "OK",
                text: async () => JSON.stringify({ ok: true, updatedAt: "now", total: 1, seq: 1 }),
            });
        }),
    );
}

const withText = (art: ArtifactContent, id: string, text: string): ArtifactContent => ({
    ...art,
    sections: art.sections.map((s) =>
        s.id === id ? { ...s, root: { ...s.root, data: { text } } } : s,
    ),
});

let dispose: (() => void) | null = null;
// Solid's effects do not run under this harness (no reactive scheduler outside the browser build),
// so the tests drive the save through flushAutosave, which is the same code the debounce reaches.
const install = (): void => {
    createRoot((d) => {
        dispose = d;
        installAutosave();
    });
};

beforeEach(() => {
    calls = [];
    stubFetch();
    vi.useFakeTimers();
    loadArtifactContent("doc-1", doc);
    onCollabDriving(
        () => false,
        () => null,
    );
});

afterEach(() => {
    dispose?.();
    dispose = null;
    onCollabDriving(
        () => false,
        () => null,
    );
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("which driver persists", () => {
    it("saves over HTTP when there is no room", async () => {
        install();
        commit(withText(editor.artifact, "s1", "typed"));
        await flushAutosave();
        expect(saves()).toHaveLength(1);
    });

    it("stands down entirely while the socket is the driver", async () => {
        install();
        onCollabDriving(
            () => true,
            () => null,
        );
        commit(withText(editor.artifact, "s1", "typed"));
        await flushAutosave();
        expect(saves()).toHaveLength(0);
    });

    it("resumes from the last acked state when the socket goes away", async () => {
        install();
        onCollabDriving(
            () => true,
            () => null,
        );
        // two writes land over the socket; the second one is acked
        commit(withText(editor.artifact, "s1", "first"));
        const acked = editor.artifact;
        noteSavedContent(acked);
        commit(withText(editor.artifact, "s1", "second"));

        onCollabDriving(
            () => false,
            () => null,
        );
        commit(withText(editor.artifact, "s1", "third"));
        await flushAutosave();

        // exactly one save, diffed from the acked baseline rather than from the load
        expect(saves()).toHaveLength(1);
        const ops = opsSent();
        expect(ops).toHaveLength(1);
        expect(ops[0]).toMatchObject({ kind: "set" });
        expect((ops[0] as { section: Section }).section.root.data).toEqual({ text: "third" });
    });

    it("keeps the socket's ack as the baseline even across an artifact that never saved by HTTP", async () => {
        install();
        onCollabDriving(
            () => true,
            () => null,
        );
        commit(withText(editor.artifact, "s1", "typed"));
        noteSavedContent(editor.artifact);
        onCollabDriving(
            () => false,
            () => null,
        );
        await flushAutosave();
        // nothing new since the ack, so there is nothing to send
        expect(saves()).toHaveLength(0);
    });
});

// The handover in the other direction: a client coming back must not leave edits stranded in the
// HTTP path, so the drain happens before hello and the socket only becomes the driver after it.
describe("the handover on reconnect", () => {
    class FakeSocket implements SocketLike {
        readyState = 0;
        readonly sent: string[] = [];
        onopen: ((ev: Event) => void) | null = null;
        onmessage: ((ev: MessageEvent) => void) | null = null;
        onclose: ((ev: CloseEvent) => void) | null = null;
        onerror: ((ev: Event) => void) | null = null;
        send(data: string): void {
            this.sent.push(data);
        }
        close(): void {
            this.readyState = 3;
        }
        open(): void {
            this.readyState = 1;
            this.onopen?.(new Event("open"));
        }
    }

    const silentSink = (): CollabSink => ({
        welcome: () => undefined,
        peer: () => undefined,
        ops: () => undefined,
        ack: () => undefined,
        reject: () => undefined,
        granted: () => undefined,
        denied: () => undefined,
        lease: () => undefined,
        resync: () => undefined,
        down: () => undefined,
    });

    it("drains the HTTP save before saying hello, and is not the driver until it has", async () => {
        install();
        const order: string[] = [];
        const socket = new FakeSocket();
        const client = new CollabClient({
            url: "ws://test",
            connect: () => socket,
            sink: silentSink(),
            lastSeq: () => 7,
            beforeHello: async () => {
                order.push("drain");
                await Promise.resolve();
            },
        });
        client.start();
        socket.open();
        expect(client.healthy).toBe(false); // open, but not yet greeted, so not the driver
        await vi.advanceTimersByTimeAsync(0);
        order.push("hello");
        expect(client.healthy).toBe(true);
        expect(order).toEqual(["drain", "hello"]);
        expect(JSON.parse(socket.sent[0] ?? "{}")).toMatchObject({ t: "hello", lastSeq: 7 });
        client.stop();
    });

    it("spreads reconnects so a deploy does not bring every client back at once", () => {
        expect(backoffFor(3, 0)).toBeLessThan(backoffFor(3, 1));
    });
});
