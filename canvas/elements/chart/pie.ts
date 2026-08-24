import { registerChart, pieLike, pieSpans } from "./utils";

registerChart({ id: "pie", label: "Pie", render: pieLike(false), spans: pieSpans(false) });
