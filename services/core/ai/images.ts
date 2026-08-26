import type { ElementInstance, Section } from "@model/artifact";
import { mapMediaRefs, mediaRefs } from "@model/artifact";
import type { MediaItem, MediaProvider } from "@model/media";
import { searchStock, stockReady } from "@services/core/media";
import { warn } from "@services/utils/env";

// Turning a phrase into a real picture: stock search, AI generation, and the walk that fills every
// image slot in a written section.

const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// tried in order; openverse (keyless) is the fallback
const PROVIDER_ORDER: MediaProvider[] = ["unsplash", "pexels", "pixabay", "openverse"];

// stopwords dropped from image phrases — stock search matches keywords, not sentences
const STOP = new Set([
    "a",
    "an",
    "the",
    "of",
    "in",
    "on",
    "at",
    "with",
    "and",
    "for",
    "to",
    "from",
    "that",
    "this",
    "is",
    "are",
    "view",
    "photo",
    "image",
    "shot",
    "showing",
    "featuring",
    "close",
    "up",
    "over",
]);

const slug = (s: string): string =>
    s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48) || "img";

const picsum = (phrase: string): string => `https://picsum.photos/seed/${slug(phrase)}/1100/760`;

const orientOf = (aspect: unknown): string => {
    const a = typeof aspect === "number" ? aspect : 1.4;
    return a >= 1.2 ? "landscape" : a <= 0.85 ? "portrait" : "square";
};

function toQuery(phrase: string, max: number): string {
    return phrase
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 1 && !STOP.has(w))
        .slice(0, max)
        .join(" ");
}

async function findStock(phrase: string, orientation: string): Promise<MediaItem | null> {
    const ready = stockReady();
    const queries = [toQuery(phrase, 6), toQuery(phrase, 3)].filter(
        (q, i, a) => !!q && a.indexOf(q) === i,
    );
    if (!queries.length) return null;
    for (const provider of PROVIDER_ORDER) {
        if (!ready[provider]) continue;
        // both phrasings at once: they are ranked, not exclusive, so racing them halves the wait
        // while `find` still prefers the longer query when both come back with something
        const hits = await Promise.all(
            queries.map((q) =>
                searchStock(provider, q, 1, orientation, "photo")
                    .then((r) => r.items[0] ?? null)
                    .catch(() => null),
            ),
        );
        const hit = hits.find(Boolean);
        if (hit) return hit;
    }
    return null;
}

/**
 * What a slot wants, which is more than its shape. A face slot is a person the piece presents as a
 * team member, a speaker or a customer, and both halves of the resolver have to be told: a stock
 * search for "a smiling founder" returns a scene with people in it, and a generator handed the same
 * phrase at 16:9 paints one. Neither survives being cropped into a 72px circle.
 */
export interface Slot {
    orientation: string;
    face?: boolean;
}

// An avatar is the only slot the tree identifies as a person by construction, since it renders as a
// fixed square masked to a circle whatever its data says. A person in a plain `image` reads as a
// person from its phrase alone, which is the writer's job to get right, not ours to guess.
const FACE_TYPES = new Set(["avatar"]);

// What a face slot is actually asking for. Kept as prose the generator reads rather than a style
// preset, because the framing (head and shoulders, plain ground, eyes to camera) is the whole
// difference between a portrait and a photo that happens to contain a person.
const FACE_PROMPT =
    "Head-and-shoulders portrait photograph of a fictional person, plain uncluttered background, soft even light, sharp focus on the face, looking at the camera. The person:";

// Stock search matches keywords, so the shape of the picture has to be one of them. Appended
// rather than prepended: `toQuery` keeps the first N words, and the short fallback query has to
// still be about the person. Leading with these left it searching for "portrait headshot smiling".
const FACE_TERMS = "portrait headshot";

type ImageSource = "stock" | "ai";

export interface ImageOptions {
    source?: ImageSource; // default "stock"
    // `ref` is an existing image url to refine from; with one the prompt reads as an edit instruction
    generate?: (prompt: string, orientation: string, ref?: string) => Promise<string | null>;
    // Adopts a sourced picture into the workspace library and hands back its canonical url. Without
    // it the raw provider url is returned and the write path adopts it later, losing attribution.
    adopt?: (item: MediaItem) => Promise<string>;
}

export async function resolveImage(
    phrase: string,
    slot: string | Slot,
    opts: ImageOptions,
    ref?: string,
): Promise<string> {
    if (phrase.startsWith("http")) return phrase;
    const want: Slot = typeof slot === "string" ? { orientation: slot } : slot;
    if (opts.source === "ai" && opts.generate) {
        const asked = want.face ? `${FACE_PROMPT} ${phrase}` : phrase;
        const made = await opts.generate(asked, want.orientation, ref).catch(() => null);
        if (made) return made;
    }
    const stock = await findStock(want.face ? `${phrase} ${FACE_TERMS}` : phrase, want.orientation);
    if (stock) return opts.adopt ? await opts.adopt(stock).catch(() => stock.url) : stock.url;
    warn(`[ai:image] no image for "${clip(phrase, 60)}" — using placeholder`);
    return picsum(phrase);
}

// The model writes a phrase where a url belongs, so every media field in the tree is resolved at
// once through the shared walk: two passes, since the map itself is synchronous.
async function resolveTree<T>(
    tree: T,
    slotFor: (url: string) => Slot,
    opts: ImageOptions,
): Promise<T> {
    const phrases = mediaRefs(tree).filter((p) => !p.startsWith("http"));
    if (!phrases.length) return tree;
    const resolved = new Map<string, string>();
    await Promise.all(
        phrases.map(async (p) => {
            resolved.set(p, await resolveImage(p, slotFor(p), opts));
        }),
    );
    return mapMediaRefs(tree, (url) => resolved.get(url) ?? url) as T;
}

// returns a new element only when something changed (else the same ref)
export async function resolveElement(
    el: ElementInstance,
    opts: ImageOptions,
): Promise<ElementInstance> {
    const slots = slotIndex(el);
    return resolveTree(el, (url) => slots.get(url) ?? { orientation: "landscape" }, opts);
}

export async function resolveImages(section: Section, opts: ImageOptions): Promise<Section> {
    const slots = slotIndex(section.root);
    return resolveTree(section, (url) => slots.get(url) ?? { orientation: "landscape" }, opts);
}

// What each phrase in the tree is being asked for, read off the element it sits on.
function slotIndex(root: ElementInstance): Map<string, Slot> {
    const out = new Map<string, Slot>();
    const walk = (el: ElementInstance): void => {
        const data = el.data as Record<string, unknown> | undefined;
        if (!data) return;
        const src = data.src;
        const face = FACE_TYPES.has(el.type);
        if (typeof src === "string" && src)
            // An avatar is a fixed square masked to a circle, so its shape is structural and its
            // own data cannot say otherwise. Everything else takes the aspect the writer gave it.
            out.set(src, {
                orientation: face ? "square" : orientOf(data.aspect),
                ...(face ? { face: true } : {}),
            });
        for (const v of Object.values(data))
            if (Array.isArray(v))
                for (const kid of v)
                    if (
                        kid &&
                        typeof kid === "object" &&
                        typeof (kid as ElementInstance).type === "string"
                    )
                        walk(kid as ElementInstance);
    };
    walk(root);
    return out;
}
