/** Minimal CSV parser for test assertions — good enough for the simple, unquoted values this service exports. */
export function parseCsv(csv: string): {
	readonly columns: readonly string[];
	readonly rows: readonly Record<string, string>[];
} {
	const lines = csv.trim().split(/\r?\n/);
	const [headerLine, ...dataLines] = lines;
	const columns = (headerLine ?? "").split(",");
	const rows = dataLines
		.filter((line) => line.length > 0)
		.map((line) => {
			const cells = line.split(",");
			const row: Record<string, string> = {};
			columns.forEach((col, i) => {
				row[col] = cells[i] ?? "";
			});
			return row;
		});
	return { columns, rows };
}
