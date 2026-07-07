import { defineConfig } from "drizzle-kit";

export default defineConfig({
	dialect: "postgresql",
	dbCredentials: {
		url: process.env["DATABASE_URL"] ?? "",
	},
	out: "./drizzle/migrations",
	schema: "./src/adapters/out/persistence/schema/*.ts",
	verbose: true,
	strict: true,
});
