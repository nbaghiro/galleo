import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
    schema: "./services/db/schema.ts",
    out: "./services/db/migrations",
    dialect: "postgresql",
    dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
