/* @refresh reload */
import "../ui/styles.css";
import "./components/visuals.css";
import "@editor/register";
import { render } from "solid-js/web";
import { App } from "./App";

const root = document.getElementById("root");
if (root) render(() => <App />, root);
