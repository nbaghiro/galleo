import type { ArtifactContent } from "@model/content";
import { aria } from "./demos/aria";
import { fieldnotes } from "./demos/fieldnotes";
import { galleo } from "./demos/galleo";
import { helios } from "./demos/helios";
import { slowweb } from "./demos/slowweb";
import { terra } from "./demos/terra";

export interface Demo {
    id: string;
    title: string;
    artifact: ArtifactContent;
}

// Each demo ships with its own theme + a real narrative, so the editor (and themes) get exercised.
export const DEMOS: Demo[] = [
    { id: "galleo", title: "Galleo — Seed deck", artifact: galleo },
    { id: "aria", title: "Aria — Music launch", artifact: aria },
    { id: "slowweb", title: "The Slow Web — Essay", artifact: slowweb },
    { id: "terra", title: "Terra — Brand", artifact: terra },
    { id: "helios", title: "Helios — Climate report", artifact: helios },
    { id: "fieldnotes", title: "Field Notes — Journal", artifact: fieldnotes },
];
