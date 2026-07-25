import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const packageRoot = join(import.meta.dir, "..");
const srcDir = join(packageRoot, "src");

function collectSourceFiles(dir: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) {
			files.push(...collectSourceFiles(full));
		} else if (entry.endsWith(".ts")) {
			files.push(full);
		}
	}
	return files;
}

// Matches imports/requires that reference an adapter or infra layer, e.g.
// `from "@adapters/x"`, `from "../infra/y"`, `import("...adapters...")`.
const FORBIDDEN_LAYER = /(?:from|import|require)\s*\(?\s*["'][^"']*\b(adapters|infra)\b[^"']*["']/;

describe("@bio/admin-authoring module boundary", () => {
	it("exposes a barrel entry point at src/index.ts", () => {
		expect(statSync(join(srcDir, "index.ts")).isFile()).toBe(true);
	});

	it("declares the barrel as the only public export", () => {
		const pkg = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as {
			exports?: Record<string, string | Record<string, string>>;
		};
		const targets = Object.values(pkg.exports ?? {}).flatMap((entry) =>
			typeof entry === "string" ? [entry] : Object.values(entry),
		);
		expect(targets.length).toBeGreaterThan(0);
		for (const target of targets) {
			expect(target).toBe("./src/index.ts");
		}
	});

	it("never imports from adapter or infra layers", () => {
		for (const file of collectSourceFiles(srcDir)) {
			const source = readFileSync(file, "utf8");
			expect({ file, forbidden: FORBIDDEN_LAYER.test(source) }).toEqual({
				file,
				forbidden: false,
			});
		}
	});
});
