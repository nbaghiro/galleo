// A few pieces of media the demo workspace "chose": what the picker's Library shows. Template
// placeholders are adopted as `link` and filtered out there, so without these it reads empty.
// `url` is the photograph itself, so a reseed cannot depend on a placeholder host staying up.

export interface AssetSpec {
    source: "stock" | "upload";
    url: string;
    w: number;
    h: number;
    alt: string;
    author?: string;
}

export const DEMO_ASSETS: AssetSpec[] = [
    {
        source: "stock",
        url: "https://images.pexels.com/photos/30140363/pexels-photo-30140363.jpeg",
        w: 1600,
        h: 1000,
        alt: "A ridge line at dawn",
        author: "Mara Vance",
    },
    {
        source: "stock",
        url: "https://images.pexels.com/photos/8143699/pexels-photo-8143699.jpeg",
        w: 1600,
        h: 1100,
        alt: "An empty studio",
        author: "Ines Bahri",
    },
    {
        source: "upload",
        url: "https://images.pexels.com/photos/8101513/pexels-photo-8101513.jpeg",
        w: 1200,
        h: 1200,
        alt: "Product flat lay",
    },
    {
        source: "stock",
        url: "https://images.pexels.com/photos/204836/pexels-photo-204836.jpeg",
        w: 1600,
        h: 1000,
        alt: "City skyline at dusk",
        author: "Lena Osei",
    },
    {
        source: "stock",
        url: "https://images.pexels.com/photos/18171824/pexels-photo-18171824.jpeg",
        w: 1600,
        h: 1000,
        alt: "Mountain lake, still water",
        author: "Kamil Poremba",
    },
];
