/* @refresh reload */
import "../ui/styles.css";
import "../app/components/visuals.css";
import "@editor/register"; // side-effect: registers elements
import type { Component } from "solid-js";
import { render } from "solid-js/web";
import { Route, Router } from "@solidjs/router";
import { PublicView } from "./PublicView";

const NotAvailable: Component = () => (
    <div class="grid min-h-screen place-items-center bg-[#0a0a0c] px-6 text-center text-white">
        <div>
            <div class="mb-1.5 text-[16px] font-semibold">This link isn’t available</div>
            <p class="text-[13px] text-white/60">The address may be incorrect.</p>
        </div>
    </div>
);

const root = document.getElementById("root");
if (root)
    render(
        () => (
            <Router>
                <Route path="/p/:slug" component={PublicView} />
                <Route path="*" component={NotAvailable} />
            </Router>
        ),
        root,
    );
