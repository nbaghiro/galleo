import { registerChart, pieLike } from "./utils";

registerChart({ id: "pie", label: "Pie", render: pieLike(false) });
