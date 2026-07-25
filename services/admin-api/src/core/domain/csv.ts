/**
 * Minimal, dependency-free CSV serialisation (pure — no ports, no I/O).
 *
 * Escapes a field per RFC 4180: wrap in double quotes and double any embedded
 * quote whenever the field contains a comma, quote, or newline.
 */
function escapeCsvField(value: string): string {
	if (/[",\n\r]/.test(value)) {
		return `"${value.replace(/"/g, '""')}"`;
	}
	return value;
}

/** Render an array of flat records as a CSV string (header row + one row per record). */
export function toCsv(columns: readonly string[], rows: readonly (readonly unknown[])[]): string {
	const lines = [columns.map(escapeCsvField).join(",")];
	for (const row of rows) {
		lines.push(
			row
				.map((cell) => escapeCsvField(cell === null || cell === undefined ? "" : String(cell)))
				.join(","),
		);
	}
	return `${lines.join("\r\n")}\r\n`;
}
