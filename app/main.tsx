/* @refresh reload */
import "@ui/styles.css";
import "./components/visuals.css";
import "@elements/register";
import { render } from "solid-js/web";
import { App } from "./App";
import { initAnalytics } from "@ui/analytics";

// No key, no init: dev and CI make no analytics request at all.
initAnalytics("app");

const root = document.getElementById("root");
if (root) render(() => <App />, root);
