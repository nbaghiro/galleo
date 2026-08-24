// A few pieces of media the demo workspace "chose": what the picker's Library shows. Template
// placeholders are adopted as `link` and filtered out there, so without these it reads empty.
// `seed` is the picsum key, which pins the picture across reseeds.

export interface AssetSpec {
    source: "stock" | "upload";
    seed: string;
    w: number;
    h: number;
    alt: string;
    author?: string;
}

export const DEMO_ASSETS: AssetSpec[] = [
    {
        source: "stock",
        seed: "galleo-ridge",
        w: 1600,
        h: 1000,
        alt: "A ridge line at dawn",
        author: "Mara Vance",
    },
    {
        source: "stock",
        seed: "galleo-studio",
        w: 1600,
        h: 1100,
        alt: "An empty studio",
        author: "Ines Bahri",
    },
    { source: "upload", seed: "galleo-flatlay", w: 1200, h: 1200, alt: "Product flat lay" },
    {
        source: "stock",
        seed: "galleo-city",
        w: 1600,
        h: 1000,
        alt: "City skyline at dusk",
        author: "Lena Osei",
    },
    {
        source: "stock",
        seed: "galleo-lake",
        w: 1600,
        h: 1000,
        alt: "Mountain lake, still water",
        author: "Kamil Poremba",
    },
];
