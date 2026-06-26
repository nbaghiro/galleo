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
import { render } from "solid-js/web";
import { Studio } from "./Studio";
import "./studio.css";

const root = document.getElementById("root");
if (root) render(() => <Studio />, root);
