import type { Component } from "solid-js";
import { Eyebrow } from "@ui/button";
import { Sidebar, SidebarToggle } from "../components/Sidebar";
import { TemplateGallery } from "../components/TemplateGallery";

export const TemplatesView: Component = () => (
    <div class="flex h-full">
        <Sidebar />
        <main class="min-w-0 flex-1 overflow-y-auto bg-canvas">
            <SidebarToggle />
            <div class="border-b border-line px-5 py-7 md:px-9">
                <Eyebrow tracking="widest" as="div">
                    Start from a template
                </Eyebrow>
                <h1 class="mt-1 font-display text-[26px] font-semibold text-ink">Templates</h1>
                <p class="mt-1 text-[13px] text-muted">
                    Beautiful, ready-to-edit starting points — pick one and make it yours.
                </p>
            </div>
            <TemplateGallery />
        </main>
    </div>
);
