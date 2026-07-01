import type { ArtifactContent } from "@model/content";
import { aria } from "./fixtures/aria";
import { fieldnotes } from "./fixtures/fieldnotes";
import { galleo } from "./fixtures/galleo";
import { helios } from "./fixtures/helios";
import { lumen } from "./fixtures/lumen";
import { slowweb } from "./fixtures/slowweb";
import { terra } from "./fixtures/terra";

export interface Demo {
    id: string;
    title: string;
    artifact: ArtifactContent;
}

// Each demo ships with its own theme + a real narrative, across deck / doc / web — so the editor,
// themes, and every format get exercised with comprehensive, image-rich content.
export const DEMOS: Demo[] = [
    { id: "galleo", title: "Galleo — Seed deck", artifact: galleo },
    { id: "aria", title: "Aria — Album launch", artifact: aria },
    { id: "terra", title: "Terra — Brand site", artifact: terra },
    { id: "lumen", title: "Lumen — Product launch", artifact: lumen },
    { id: "slowweb", title: "The Slow Web — Essay", artifact: slowweb },
    { id: "helios", title: "Helios — Climate report", artifact: helios },
    { id: "fieldnotes", title: "Field Notes — Faroe Islands", artifact: fieldnotes },
];
