/* @refresh reload */
import "@elements/text";
import "@elements/image";
import "@elements/card";
import "@elements/group";
import "@elements/stat";
import "@elements/bullets";
import "@elements/button";
import "@elements/divider";
import "@elements/quote";
import "@elements/callout";
import "@elements/code";
import "@elements/badge";
import "@elements/spacer";
import "@elements/gradient";
import "@elements/chart";
import "@elements/table";
import "@elements/diagram";
import "@elements/video";
import "@elements/embed";
import { render } from "solid-js/web";
import { Studio } from "./Studio";
import "./studio.css";

const root = document.getElementById("root");
if (root) render(() => <Studio />, root);
