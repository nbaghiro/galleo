import type { Component } from "solid-js";
import { Canvas } from "./Canvas";
import { Minimap } from "./Minimap";
import { Panel } from "./Panel";
import { Topbar } from "./Topbar";

// The studio shell: topbar over a three-column body (minimap · canvas · right panel).
export const Studio: Component = () => (
    <div class="grid h-screen grid-rows-[52px_1fr] bg-canvas text-ink">
        <Topbar />
        <div class="grid min-h-0 grid-cols-[188px_1fr_296px]">
            <Minimap />
            <Canvas />
            <Panel />
        </div>
    </div>
);
