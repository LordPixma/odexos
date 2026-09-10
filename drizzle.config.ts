import { defineConfig } from "drizzle-kit";

// Generates SQL migrations from the Drizzle schema into ./migrations.
// Apply them to D1 with:
//   npm run db:migrate:local    (local dev database)
//   npm run db:migrate:remote   (deployed Cloudflare D1)
export default defineConfig({
  schema: "./worker/db/schema.ts",
  out: "./migrations",
  dialect: "sqlite",
});
