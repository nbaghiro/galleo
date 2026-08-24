import { registerChart, pieLike, pieSpans } from "./utils";

registerChart({ id: "donut", label: "Donut", render: pieLike(true), spans: pieSpans(true) });
