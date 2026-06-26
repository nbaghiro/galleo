import { defineConfig } from "drizzle-kit";

export default defineConfig({
    schema: "./services/data/schema.ts",
    out: "./services/data/migrations",
    dialect: "postgresql",
    dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
